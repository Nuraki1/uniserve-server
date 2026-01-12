import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const tableCreateSchema = z.object({
  number: z.string().min(1),
  capacity: z.number().int().positive(),
  section: z.string().optional(),
  branchId: z.string().optional(),
});

const tableUpdateSchema = tableCreateSchema.partial();

export function createTablesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const branchIdQuery = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const authed = req.user!;
    const effectiveBranchId = authed.role === "admin" ? branchIdQuery : (authed.branchId ?? branchIdQuery);

    const tables = await prisma.table.findMany({
      where: effectiveBranchId ? { branchId: effectiveBranchId } : undefined,
      orderBy: [{ section: "asc" }, { number: "asc" }],
      take: 2000,
    });
    return res.json({ success: true, data: tables });
  });

  // Only admin manages table definitions
  router.post("/", requireRole(["admin"]), async (req, res) => {
    const parsed = tableCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const table = await prisma.table.create({
        data: {
          number: parsed.data.number.trim(),
          capacity: parsed.data.capacity,
          section: parsed.data.section?.trim() || null,
          branchId: parsed.data.branchId || null,
        },
      });
      return res.status(201).json({ success: true, data: table });
    } catch {
      return res.status(400).json({ success: false, error: "Table already exists for this branch" });
    }
  });

  router.put("/:id", requireRole(["admin"]), async (req, res) => {
    const parsed = tableUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const table = await prisma.table.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.number !== undefined ? { number: parsed.data.number.trim() } : {}),
          ...(parsed.data.capacity !== undefined ? { capacity: parsed.data.capacity } : {}),
          ...(parsed.data.section !== undefined ? { section: parsed.data.section?.trim() || null } : {}),
          ...(parsed.data.branchId !== undefined ? { branchId: parsed.data.branchId ?? null } : {}),
        },
      });
      return res.json({ success: true, data: table });
    } catch {
      return res.status(404).json({ success: false, error: "Table not found" });
    }
  });

  router.delete("/:id", requireRole(["admin"]), async (req, res) => {
    try {
      await prisma.table.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch {
      return res.status(404).json({ success: false, error: "Table not found" });
    }
  });

  return router;
}



