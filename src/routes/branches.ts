import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const branchCreateSchema = z.object({
  id: z.string().min(1), // e.g. "furi"
  name: z.string().min(1),
  location: z.string().optional(),
  phone: z.string().optional(),
  manager: z.string().optional(),
});

const branchUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  manager: z.string().nullable().optional(),
});

export function createBranchesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (_req, res) => {
    const branches = await prisma.branch.findMany({ orderBy: { name: "asc" }, take: 200 });
    return res.json({ success: true, data: branches });
  });

  router.post("/", requireRole(["admin"]), async (req, res) => {
    const parsed = branchCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const branch = await prisma.branch.create({
        data: {
          id: parsed.data.id.trim(),
          name: parsed.data.name.trim(),
          location: parsed.data.location ?? null,
          phone: parsed.data.phone ?? null,
          manager: parsed.data.manager ?? null,
        },
      });
      return res.status(201).json({ success: true, data: branch });
    } catch {
      return res.status(400).json({ success: false, error: "Branch already exists" });
    }
  });

  router.put("/:id", requireRole(["admin"]), async (req, res) => {
    const parsed = branchUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const branch = await prisma.branch.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.location !== undefined ? { location: parsed.data.location ?? null } : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? null } : {}),
          ...(parsed.data.manager !== undefined ? { manager: parsed.data.manager ?? null } : {}),
        },
      });
      return res.json({ success: true, data: branch });
    } catch {
      return res.status(404).json({ success: false, error: "Branch not found" });
    }
  });

  router.delete("/:id", requireRole(["admin"]), async (req, res) => {
    try {
      await prisma.branch.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch {
      return res.status(404).json({ success: false, error: "Branch not found" });
    }
  });

  return router;
}



