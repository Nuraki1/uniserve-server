import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const subBranchCreateSchema = z.object({
  name: z.string().min(1),
  branchId: z.string().min(1),
});

const subBranchUpdateSchema = z.object({
  name: z.string().min(1).optional(),
});

export function createSubBranchesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const subBranches = await prisma.subBranch.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: [{ branchId: "asc" }, { name: "asc" }],
      take: 200,
    });
    return res.json({ success: true, data: subBranches });
  });

  router.post("/", requireRole(["admin"]), async (req, res) => {
    const parsed = subBranchCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    // Verify branch exists
    const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
    if (!branch) return res.status(400).json({ success: false, error: "Branch not found" });

    try {
      const subBranch = await prisma.subBranch.create({
        data: {
          name: parsed.data.name.trim(),
          branchId: parsed.data.branchId,
        },
      });
      return res.status(201).json({ success: true, data: subBranch });
    } catch {
      return res.status(400).json({ success: false, error: "Sub-branch already exists for this branch" });
    }
  });

  router.put("/:id", requireRole(["admin"]), async (req, res) => {
    const parsed = subBranchUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const subBranch = await prisma.subBranch.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        },
      });
      return res.json({ success: true, data: subBranch });
    } catch {
      return res.status(404).json({ success: false, error: "Sub-branch not found" });
    }
  });

  router.delete("/:id", requireRole(["admin"]), async (req, res) => {
    try {
      await prisma.subBranch.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch {
      return res.status(404).json({ success: false, error: "Sub-branch not found" });
    }
  });

  return router;
}

