import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const createUserSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: z.enum(["admin", "cashier", "kitchen", "waiter"]),
    branchId: z.string().nullable().optional(),
    // Optional multi-branch assignment for staff roles (cashier/waiter/kitchen).
    // If provided, user can access exactly these branches.
    branchIds: z.array(z.string().min(1)).optional(),
    // For kitchen role: which sub-branch this kitchen account is assigned to.
    subBranchId: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "admin") return;

    // All non-admin roles: if branchId is provided, it must be a non-empty string.
    if (data.branchId !== undefined && data.branchId !== null && data.branchId.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "branchId must be a non-empty string or null",
        path: ["branchId"],
      });
    }

    if (data.branchIds && data.branchIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "branchIds must be omitted or contain at least one branch id",
        path: ["branchIds"],
      });
    }
  });

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  branchId: z.string().nullable().optional(),
  branchIds: z.array(z.string().min(1)).optional(),
  avatarUrl: z.string().nullable().optional(),
  subBranchId: z.string().nullable().optional(),
});

const updatePasswordSchema = z.object({
  password: z.string().min(6),
});

export function createAdminRouter() {
  const router = Router();
  router.use(requireAuth, requireRole(["admin"]));

  router.post("/users", async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    const email = parsed.data.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ success: false, error: "Email already exists" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const dedupedBranchIds = Array.isArray(parsed.data.branchIds)
      ? Array.from(new Set(parsed.data.branchIds.map((b) => String(b).trim()).filter(Boolean)))
      : [];

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: parsed.data.name,
        role: parsed.data.role,
        branchId:
          parsed.data.role === "admin"
            ? null
            : dedupedBranchIds.length > 0
              ? dedupedBranchIds[0]
              : (parsed.data.branchId ?? null),
        subBranchId: parsed.data.role === "kitchen" ? (parsed.data.subBranchId ?? null) : null,
      },
    });

    if (user.role !== "admin" && dedupedBranchIds.length > 0) {
      try {
        await prisma.userBranchAccess.createMany({
          data: dedupedBranchIds.map((branchId) => ({ userId: user.id, branchId })),
          skipDuplicates: true,
        });
      } catch {
        // If migrations haven't been applied yet, ignore (legacy mode).
      }
    }

    return res.status(201).json({
      success: true,
      data: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId, subBranchId: user.subBranchId, createdAt: user.createdAt },
    });
  });

  router.get("/users", async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        branchId: true,
        createdAt: true,
        avatarUrl: true,
        subBranchId: true,
        branchAccesses: { select: { branchId: true } },
      },
    });
    return res.json({ success: true, data: users });
  });

  router.put("/users/:id", async (req, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const dedupedBranchIds = Array.isArray(parsed.data.branchIds)
        ? Array.from(new Set(parsed.data.branchIds.map((b) => String(b).trim()).filter(Boolean)))
        : undefined;

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.branchId !== undefined && dedupedBranchIds === undefined ? { branchId: parsed.data.branchId } : {}),
          ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
          ...(parsed.data.subBranchId !== undefined ? { subBranchId: parsed.data.subBranchId ?? null } : {}),
        },
        select: { id: true, email: true, name: true, role: true, branchId: true, createdAt: true, avatarUrl: true, subBranchId: true },
      });

      // Update multi-branch access list if branchIds was provided.
      if (dedupedBranchIds !== undefined && user.role !== "admin") {
        try {
          await prisma.userBranchAccess.deleteMany({ where: { userId: user.id } });
          if (dedupedBranchIds.length > 0) {
            await prisma.userBranchAccess.createMany({
              data: dedupedBranchIds.map((branchId) => ({ userId: user.id, branchId })),
              skipDuplicates: true,
            });
            // Keep legacy branchId in sync for older clients (use first branch as "home")
            await prisma.user.update({ where: { id: user.id }, data: { branchId: dedupedBranchIds[0] } });
          } else {
            // All branches: no access rows, branchId null
            await prisma.user.update({ where: { id: user.id }, data: { branchId: null } });
          }
        } catch {
          // ignore if table doesn't exist yet
        }
      }

      return res.json({ success: true, data: user });
    } catch {
      return res.status(404).json({ success: false, error: "User not found" });
    }
  });

  router.put("/users/:id/password", async (req, res) => {
    const parsed = updatePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    try {
      await prisma.user.update({
        where: { id: req.params.id },
        data: { passwordHash },
      });
      return res.json({ success: true });
    } catch {
      return res.status(404).json({ success: false, error: "User not found" });
    }
  });

  router.delete("/users/:id", async (req, res) => {
    try {
      await prisma.user.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch {
      return res.status(404).json({ success: false, error: "User not found" });
    }
  });

  return router;
}


