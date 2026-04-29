import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../env";
import { requireAuth } from "../middleware/auth";
import { getPasswordResetClientBaseUrl, isSmtpConfigured, sendPasswordResetEmail } from "../mail/send-password-reset";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const bootstrapAdminSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export function createAuthRouter() {
  const router = Router();

  /**
   * Create an admin (owner) account. Gated by env.BOOTSTRAP_TOKEN so registration is not public.
   * Multiple admins are allowed; existing admins can also create admins via /api/admin/users.
   */
  router.post("/bootstrap-admin", async (req, res) => {
    const parsed = bootstrapAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    if (!env.BOOTSTRAP_TOKEN || parsed.data.token !== env.BOOTSTRAP_TOKEN) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const email = parsed.data.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ success: false, error: "Email already exists" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: parsed.data.name, role: "admin", branchId: null },
    });

    return res.status(201).json({
      success: true,
      data: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt },
    });
  });

  /**
   * Request a password reset email. Response is generic whether or not the email exists.
   */
  router.post("/forgot-password", async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }

    const email = parsed.data.email.toLowerCase();
    const generic = {
      success: true as const,
      data: {
        message: "If an account exists for this email, you will receive password reset instructions shortly.",
      },
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json(generic);
    }

    if (!isSmtpConfigured()) {
      console.error("[auth] forgot-password: SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)");
      return res.json(generic);
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    const base = getPasswordResetClientBaseUrl();
    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      console.error("[auth] forgot-password: failed to send email", err);
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    }

    return res.json(generic);
  });

  router.post("/reset-password", async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }

    const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: "Invalid or expired reset link. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
    ]);

    return res.json({ success: true, data: { message: "Password updated. You can sign in with your new password." } });
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });

    // Compute allowed branches (supports multi-branch access table when migrated).
    let accessIds: string[] = [];
    try {
      const rows = await prisma.userBranchAccess.findMany({
        where: { userId: user.id },
        select: { branchId: true },
      });
      accessIds = rows.map((r: { branchId: string }) => String(r.branchId));
    } catch {
      // ignore if table missing
      accessIds = [];
    }
    const allowedBranchIds =
      user.role === "admin" ? null : accessIds.length > 0 ? accessIds : user.branchId ? [user.branchId] : null;

    const token = jwt.sign(
      { id: user.id, role: user.role, branchId: user.branchId, email: user.email, name: user.name },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
          allowedBranchIds,
          avatarUrl: user.avatarUrl,
          kitchenAllowedCategories: user.kitchenAllowedCategories,
          subBranchId: user.subBranchId,
          createdAt: user.createdAt,
        },
      },
    });
  });

  router.get("/me", requireAuth, async (req, res) => {
    const u = req.user!;
    // Note: req.user already contains latest branch scope; still load user for profile fields.
    const user = await prisma.user.findUnique({ where: { id: u.id } });
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        allowedBranchIds: u.allowedBranchIds ?? null,
        avatarUrl: user.avatarUrl,
        kitchenAllowedCategories: user.kitchenAllowedCategories,
        subBranchId: user.subBranchId,
        createdAt: user.createdAt,
      },
    });
  });

  return router;
}


