import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
const orderStatusSchema = z.enum([
    "pending",
    "accepted",
    "preparing",
    "prepared",
    "completed",
    "paid",
]);
const orderItemSchema = z
    .object({
    name: z.string().min(1),
    price: z.number(),
    quantity: z.number().int().positive(),
})
    .passthrough();
const createOrderSchema = z.object({
    items: z.array(orderItemSchema).min(1),
    table: z.string().optional(),
    customer: z.string().optional(),
    customerId: z.string().optional(),
    waiter: z.string().optional(),
    waiterUserId: z.string().optional(),
    branchId: z.string().optional(),
    clientRequestId: z.string().optional(),
});
const completePaymentSchema = z.object({
    paymentMethod: z.enum(["cash", "card", "bank", "prepaid", "credit"]),
    discount: z.number().optional().default(0),
    bankType: z.string().optional(),
});
const updatePaymentMethodSchema = z.object({
    paymentMethod: z.enum(["cash", "card", "bank", "prepaid", "credit"]),
    bankType: z.string().optional().nullable(),
});
export function createOrdersRouter(io) {
    const router = Router();
    // Most order operations should be authenticated (role-based restrictions can be expanded later)
    router.use(requireAuth);
    router.get("/", async (req, res) => {
        const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
        const authed = req.user;
        const effectiveBranchId = authed.role === "admin" ? branchId : (authed.branchId ?? branchId);
        const orders = await prisma.order.findMany({
            where: effectiveBranchId ? { branchId: effectiveBranchId } : undefined,
            orderBy: { createdAt: "desc" },
            take: 500,
        });
        res.json({ success: true, data: orders });
    });
    router.post("/", async (req, res) => {
        const parsed = createOrderSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: parsed.error.message });
        }
        const authed = req.user;
        const branchId = authed.role === "admin" ? (parsed.data.branchId ?? null) : (authed.branchId ?? parsed.data.branchId ?? null);
        // Idempotency: if clientRequestId already exists, return existing order (avoid double clicks)
        if (parsed.data.clientRequestId) {
            const existing = await prisma.order.findUnique({ where: { clientRequestId: parsed.data.clientRequestId } });
            if (existing) {
                return res.status(200).json({ success: true, data: existing, idempotent: true });
            }
        }
        const subtotal = parsed.data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const tax = subtotal * 0.1;
        const discount = 0;
        const total = subtotal + tax - discount;
        const maxOrder = await prisma.order.aggregate({
            where: branchId ? { branchId } : undefined,
            _max: { orderNumber: true },
        });
        const nextOrderNumber = (maxOrder._max.orderNumber ?? 0) + 1;
        const order = await prisma.order.create({
            data: {
                orderNumber: nextOrderNumber,
                items: parsed.data.items,
                table: parsed.data.table,
                customer: parsed.data.customer,
                customerId: parsed.data.customerId,
                waiter: parsed.data.waiter,
                waiterUserId: parsed.data.waiterUserId,
                branchId: branchId ?? undefined,
                clientRequestId: parsed.data.clientRequestId,
                subtotal,
                tax,
                discount,
                total,
                status: "pending",
            },
        });
        if (order.branchId)
            io.to(`branch:${order.branchId}`).emit("order:created", order);
        io.emit("order:created", order);
        return res.status(201).json({ success: true, data: order });
    });
    router.put("/:id/status", async (req, res) => {
        const orderId = req.params.id;
        const parsed = z.object({ status: orderStatusSchema }).safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: parsed.error.message });
        }
        try {
            const status = parsed.data.status;
            const order = await prisma.order.update({
                where: { id: orderId },
                data: {
                    status,
                    preparedAt: status === "prepared" ? new Date() : undefined,
                    paidAt: status === "paid" ? new Date() : undefined,
                },
            });
            if (order.branchId)
                io.to(`branch:${order.branchId}`).emit("order:updated", order);
            io.emit("order:updated", order);
            return res.json({ success: true, data: order });
        }
        catch (e) {
            // Prisma "Record to update not found."
            if (e?.code === "P2025") {
                return res.status(404).json({ success: false, error: "Order not found" });
            }
            return res.status(500).json({ success: false, error: "Failed to update order status" });
        }
    });
    router.post("/:id/payment", async (req, res) => {
        const orderId = req.params.id;
        const parsed = completePaymentSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ success: false, error: parsed.error.message });
        try {
            const existing = await prisma.order.findUnique({ where: { id: orderId } });
            if (!existing)
                return res.status(404).json({ success: false, error: "Order not found" });
            const discount = parsed.data.discount ?? 0;
            const total = existing.subtotal + existing.tax - discount;
            const order = await prisma.order.update({
                where: { id: orderId },
                data: {
                    paymentMethod: parsed.data.paymentMethod,
                    bankType: parsed.data.bankType,
                    discount,
                    total,
                    status: "paid",
                    paidAt: new Date(),
                },
            });
            if (order.branchId)
                io.to(`branch:${order.branchId}`).emit("order:updated", order);
            io.emit("order:updated", order);
            return res.json({ success: true, data: order });
        }
        catch {
            return res.status(500).json({ success: false, error: "Failed to complete payment" });
        }
    });
    // Allow cashier/admin to correct payment method after checkout (customer request)
    router.put("/:id/payment-method", async (req, res) => {
        // Only cashier/admin should do this
        if (!req.user || (req.user.role !== "admin" && req.user.role !== "cashier")) {
            return res.status(403).json({ success: false, error: "Forbidden" });
        }
        const orderId = req.params.id;
        const parsed = updatePaymentMethodSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ success: false, error: parsed.error.message });
        try {
            const existing = await prisma.order.findUnique({ where: { id: orderId } });
            if (!existing)
                return res.status(404).json({ success: false, error: "Order not found" });
            const paymentMethod = parsed.data.paymentMethod;
            const bankType = paymentMethod === "bank" ? (parsed.data.bankType ?? existing.bankType ?? null) : null;
            const order = await prisma.order.update({
                where: { id: orderId },
                data: {
                    paymentMethod,
                    bankType,
                },
            });
            if (order.branchId)
                io.to(`branch:${order.branchId}`).emit("order:updated", order);
            io.emit("order:updated", order);
            return res.json({ success: true, data: order });
        }
        catch {
            return res.status(500).json({ success: false, error: "Failed to update payment method" });
        }
    });
    return router;
}
