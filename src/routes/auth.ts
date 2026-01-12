import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { env } from "../env";
import { requireAuth } from "../middleware/auth";

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

export function createAuthRouter() {
  const router = Router();

  /**
   * Create the very first admin (only if no admin exists yet).
   * This is gated by env.BOOTSTRAP_TOKEN to avoid open registration.
   */
  router.post("/bootstrap-admin", async (req, res) => {
    const parsed = bootstrapAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    if (!env.BOOTSTRAP_TOKEN || parsed.data.token !== env.BOOTSTRAP_TOKEN) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
    if (existingAdmin) {
      return res.status(409).json({ success: false, error: "Admin already exists" });
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
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
        },
      },
    });
  });

  router.get("/me", requireAuth, async (req, res) => {
    const u = req.user!;
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
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    });
  });

  return router;
}


