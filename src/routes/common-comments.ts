import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const createSchema = z.object({
  text: z.string().min(1),
  category: z.string().optional(),
  branchId: z.string().optional(),
});

const updateSchema = createSchema.partial();

export function createCommonCommentsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const authed = req.user!;
    const branchIdQuery = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const categoryQuery = typeof req.query.category === "string" ? req.query.category : undefined;

    // Non-admins only see their branch + global comments.
    const effectiveBranchId = authed.role === "admin" ? branchIdQuery : (authed.branchId ?? branchIdQuery);

    try {
      const comments = await prisma.commonComment.findMany({
        where: {
          AND: [
            categoryQuery ? { OR: [{ category: null }, { category: categoryQuery }] } : {},
            effectiveBranchId
              ? { OR: [{ branchId: null }, { branchId: effectiveBranchId }] }
              : {},
          ],
        },
        orderBy: [{ category: "asc" }, { createdAt: "desc" }],
        take: 500,
      });
      return res.json({ success: true, data: comments });
    } catch (e: any) {
      // If DB wasn't migrated yet, don't crash the server.
      if (e?.code === "P2021") {
        return res.json({
          success: true,
          data: [],
          warning: "CommonComment table missing. Run Prisma migration to persist admin comments.",
        });
      }
      throw e;
    }
  });

  router.post("/", requireRole(["admin"]), async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const comment = await prisma.commonComment.create({
        data: {
          text: parsed.data.text.trim(),
          category: parsed.data.category?.trim() || null,
          branchId: parsed.data.branchId?.trim() || null,
        },
      });
      return res.status(201).json({ success: true, data: comment });
    } catch (e: any) {
      if (e?.code === "P2021") {
        return res.status(503).json({
          success: false,
          error: "CommonComment table missing. Run Prisma migration (prisma migrate dev) then retry.",
        });
      }
      throw e;
    }
  });

  router.put("/:id", requireRole(["admin"]), async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const comment = await prisma.commonComment.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.text !== undefined ? { text: parsed.data.text.trim() } : {}),
          ...(parsed.data.category !== undefined ? { category: parsed.data.category?.trim() || null } : {}),
          ...(parsed.data.branchId !== undefined ? { branchId: parsed.data.branchId?.trim() || null } : {}),
        },
      });
      return res.json({ success: true, data: comment });
    } catch (e: any) {
      if (e?.code === "P2021") {
        return res.status(503).json({
          success: false,
          error: "CommonComment table missing. Run Prisma migration (prisma migrate dev) then retry.",
        });
      }
      return res.status(404).json({ success: false, error: "Comment not found" });
    }
  });

  router.delete("/:id", requireRole(["admin"]), async (req, res) => {
    try {
      await prisma.commonComment.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch (e: any) {
      if (e?.code === "P2021") {
        return res.status(503).json({
          success: false,
          error: "CommonComment table missing. Run Prisma migration (prisma migrate dev) then retry.",
        });
      }
      return res.status(404).json({ success: false, error: "Comment not found" });
    }
  });

  return router;
}



