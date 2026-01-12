import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
const accountTypeSchema = z.enum(["prepaid", "credit", "regular"]);
const customerCreateSchema = z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
    branchId: z.string().optional(),
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
        const authed = req.user;
        const effectiveBranchId = authed.role === "admin" ? branchIdQuery : (authed.branchId ?? branchIdQuery);
        const customers = await prisma.customer.findMany({
            where: effectiveBranchId ? { branchId: effectiveBranchId } : undefined,
            orderBy: { createdAt: "desc" },
            take: 2000,
        });
        return res.json({ success: true, data: customers });
    });
    // Admin + Cashier can manage customers (accounts, topups, etc.)
    router.post("/", requireRole(["admin", "cashier"]), async (req, res) => {
        const parsed = customerCreateSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ success: false, error: parsed.error.message });
        const authed = req.user;
        const branchId = authed.role === "admin" ? (parsed.data.branchId ?? null) : (authed.branchId ?? parsed.data.branchId ?? null);
        if (!branchId) {
            return res.status(400).json({ success: false, error: "branchId is required to create a customer" });
        }
        const customer = await prisma.customer.create({
            data: {
                name: parsed.data.name.trim(),
                phone: parsed.data.phone?.trim() || null,
                email: parsed.data.email?.trim() || null,
                notes: parsed.data.notes || null,
                branchId,
                accountType: parsed.data.accountType ?? "regular",
                balance: parsed.data.balance ?? 0,
                creditLimit: parsed.data.creditLimit ?? null,
                creditUsed: parsed.data.creditUsed ?? null,
            },
        });
        return res.status(201).json({ success: true, data: customer });
    });
    router.put("/:id", requireRole(["admin", "cashier"]), async (req, res) => {
        const parsed = customerUpdateSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ success: false, error: parsed.error.message });
        const authed = req.user;
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
                    ...(branchId !== undefined ? { branchId } : {}),
                },
            });
            return res.json({ success: true, data: customer });
        }
        catch {
            return res.status(404).json({ success: false, error: "Customer not found" });
        }
    });
    router.delete("/:id", requireRole(["admin", "cashier"]), async (req, res) => {
        try {
            await prisma.customer.delete({ where: { id: req.params.id } });
            return res.json({ success: true });
        }
        catch {
            return res.status(404).json({ success: false, error: "Customer not found" });
        }
    });
    return router;
}
