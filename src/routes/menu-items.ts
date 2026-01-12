import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const menuItemCreateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.number().nonnegative(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  branchId: z.string().optional(),
});

const menuItemUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
  available: z.boolean().optional(),
});

export function createMenuItemsRouter() {
  const router = Router();

  // All menu endpoints require auth (kitchen/cashier/waiter need to read)
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const items = await prisma.menuItem.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 2000,
    });
    return res.json({ success: true, data: items });
  });

  router.post("/", requireRole(["admin"]), async (req, res) => {
    const parsed = menuItemCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    const item = await prisma.menuItem.create({
      data: {
        name: parsed.data.name.trim(),
        category: parsed.data.category.trim(),
        price: parsed.data.price,
        description: parsed.data.description?.trim() || null,
        imageUrl: parsed.data.imageUrl || null,
        branchId: parsed.data.branchId || null,
      },
    });

    return res.status(201).json({ success: true, data: item });
  });

  router.put("/:id", requireRole(["admin"]), async (req, res) => {
    const parsed = menuItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const item = await prisma.menuItem.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.category !== undefined ? { category: parsed.data.category.trim() } : {}),
          ...(parsed.data.price !== undefined ? { price: parsed.data.price } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description ?? null } : {}),
          ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl ?? null } : {}),
          ...(parsed.data.branchId !== undefined ? { branchId: parsed.data.branchId ?? null } : {}),
          ...(parsed.data.available !== undefined ? { available: parsed.data.available } : {}),
        },
      });
      return res.json({ success: true, data: item });
    } catch {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }
  });

  router.delete("/:id", requireRole(["admin"]), async (req, res) => {
    try {
      await prisma.menuItem.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }
  });

  // Toggle availability (kitchen + admin)
  router.patch("/:id/availability", requireRole(["admin", "kitchen"]), async (req, res) => {
    try {
      const current = await prisma.menuItem.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ success: false, error: "Menu item not found" });

      const next = await prisma.menuItem.update({
        where: { id: req.params.id },
        data: { available: !current.available },
      });
      return res.json({ success: true, data: next });
    } catch {
      return res.status(500).json({ success: false, error: "Failed to update availability" });
    }
  });

  return router;
}




