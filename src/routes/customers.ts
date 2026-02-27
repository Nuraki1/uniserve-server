import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { canAccessBranch, getBranchScope, resolveBranchIdForWrite } from "../utils/branch-access";
import { requireAction } from "../middleware/permissions";

const accountTypeSchema = z.enum(["prepaid", "credit", "regular"]);

const customerCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  branchId: z.string().optional(),
  branchIds: z.array(z.string().min(1)).optional(),
  accountType: accountTypeSchema.optional(),
  balance: z.number().optional(),
  creditLimit: z.number().optional(),
  creditUsed: z.number().optional(),
});

const customerUpdateSchema = customerCreateSchema.partial();

export function createCustomersRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const branchIdQuery = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const authed = req.user!;

    const requested = branchIdQuery?.trim() || undefined;
    if (requested && !canAccessBranch(authed, requested)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const scope = getBranchScope(authed);
    const where =
      requested
        ? {
            OR: [
              { branchId: null },
              { branchId: requested },
              { customerAccesses: { some: { branchId: requested } } },
            ],
          }
        : scope.mode === "all"
          ? undefined
          : {
              OR: [
                { branchId: null },
                { branchId: { in: scope.branchIds } },
                { customerAccesses: { some: { branchId: { in: scope.branchIds } } } },
              ],
            };

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 2000,
      include: { customerAccesses: { select: { branchId: true } } },
    });
    return res.json({ success: true, data: customers });
  });

  // Admin + Cashier can manage customers (accounts, topups, etc.)
  router.post("/", requireRole(["admin", "cashier"]), requireAction("manage-customer-accounts"), async (req, res) => {
    const parsed = customerCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    const authed = req.user!;

    const dedupedBranchIds = Array.isArray(parsed.data.branchIds)
      ? Array.from(new Set(parsed.data.branchIds.map((b) => String(b).trim()).filter(Boolean)))
      : [];

    // If branchIds are provided, enforce they are allowed for non-admin.
    if (authed.role !== "admin" && dedupedBranchIds.length > 0) {
      for (const bid of dedupedBranchIds) {
        if (!canAccessBranch(authed, bid)) return res.status(403).json({ success: false, error: "Forbidden" });
      }
    }

    const resolved = resolveBranchIdForWrite(authed, parsed.data.branchId ?? null);
    if (resolved.status) return res.status(resolved.status).json({ success: false, error: resolved.error });
    const branchId = dedupedBranchIds.length > 0 ? dedupedBranchIds[0] : resolved.branchId;
    if (!branchId && dedupedBranchIds.length === 0) {
      return res.status(400).json({ success: false, error: "branchId is required to create a customer" });
    }

    const customer = await prisma.customer.create({
      data: {
        name: parsed.data.name.trim(),
        phone: parsed.data.phone?.trim() || null,
        email: parsed.data.email?.trim() || null,
        notes: parsed.data.notes || null,
        branchId: branchId ?? null,
        accountType: parsed.data.accountType ?? "regular",
        balance: parsed.data.balance ?? 0,
        creditLimit: parsed.data.creditLimit ?? null,
        creditUsed: parsed.data.creditUsed ?? null,
      },
    });

    if (dedupedBranchIds.length > 0) {
      try {
        await prisma.customerBranchAccess.createMany({
          data: dedupedBranchIds.map((branchId) => ({ customerId: customer.id, branchId })),
          skipDuplicates: true,
        });
      } catch {
        // ignore if table missing
      }
    }
    return res.status(201).json({ success: true, data: customer });
  });

  router.put("/:id", requireRole(["admin", "cashier"]), requireAction("manage-customer-accounts"), async (req, res) => {
    const parsed = customerUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    const authed = req.user!;
    const dedupedBranchIds = Array.isArray(parsed.data.branchIds)
      ? Array.from(new Set(parsed.data.branchIds.map((b) => String(b).trim()).filter(Boolean)))
      : undefined;

    if (authed.role !== "admin" && Array.isArray(dedupedBranchIds)) {
      for (const bid of dedupedBranchIds) {
        if (!canAccessBranch(authed, bid)) return res.status(403).json({ success: false, error: "Forbidden" });
      }
    }

    const branchId = authed.role === "admin" ? (parsed.data.branchId ?? undefined) : undefined;

    try {
      const customer = await prisma.customer.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone?.trim() || null } : {}),
          ...(parsed.data.email !== undefined ? { email: parsed.data.email?.trim() || null } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
          ...(parsed.data.accountType !== undefined ? { accountType: parsed.data.accountType } : {}),
          ...(parsed.data.balance !== undefined ? { balance: parsed.data.balance } : {}),
          ...(parsed.data.creditLimit !== undefined ? { creditLimit: parsed.data.creditLimit ?? null } : {}),
          ...(parsed.data.creditUsed !== undefined ? { creditUsed: parsed.data.creditUsed ?? null } : {}),
          ...(branchId !== undefined && dedupedBranchIds === undefined ? { branchId } : {}),
        },
      });

      if (dedupedBranchIds !== undefined) {
        try {
          await prisma.customerBranchAccess.deleteMany({ where: { customerId: customer.id } });
          if (dedupedBranchIds.length > 0) {
            await prisma.customerBranchAccess.createMany({
              data: dedupedBranchIds.map((branchId) => ({ customerId: customer.id, branchId })),
              skipDuplicates: true,
            });
            await prisma.customer.update({ where: { id: customer.id }, data: { branchId: dedupedBranchIds[0] } });
          } else {
            await prisma.customer.update({ where: { id: customer.id }, data: { branchId: null } });
          }
        } catch {
          // ignore if table missing
        }
      }
      return res.json({ success: true, data: customer });
    } catch {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }
  });

  router.delete("/:id", requireRole(["admin", "cashier"]), requireAction("manage-customer-accounts"), async (req, res) => {
    try {
      await prisma.customer.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }
  });

  return router;
}


