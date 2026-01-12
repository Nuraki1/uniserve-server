import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const updateMeSchema = z.object({
  avatarUrl: z.string().nullable().optional(),
  name: z.string().min(1).optional(),
});

export function createUsersRouter() {
  const router = Router();
  router.use(requireAuth);

  // Update own profile (used by waiter/kitchen avatar upload)
  router.put("/me", async (req, res) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        },
        select: { id: true, email: true, name: true, role: true, branchId: true, createdAt: true, avatarUrl: true },
      });
      return res.json({ success: true, data: user });
    } catch {
      return res.status(404).json({ success: false, error: "User not found" });
    }
  });

  return router;
}




