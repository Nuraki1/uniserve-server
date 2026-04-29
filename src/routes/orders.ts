import type { Server as SocketIOServer } from "socket.io";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { branchWhereForRead, canAccessBranch, resolveBranchIdForWrite } from "../utils/branch-access";
import { requireAction } from "../middleware/permissions";
import { getRolePermissions } from "../utils/permissions-store";

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

const adminOrderItemSchema = z
  .object({
    name: z.string().min(1),
    price: z.number(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
    menuItemId: z.string().optional(),
  })
  .passthrough();

const adminUpdateOrderSchema = z.object({
  items: z.array(adminOrderItemSchema).min(1),
  table: z.union([z.string(), z.null()]).optional(),
  customer: z.union([z.string(), z.null()]).optional(),
  customerId: z.union([z.string(), z.null()]).optional(),
  waiter: z.union([z.string(), z.null()]).optional(),
  waiterUserId: z.union([z.string(), z.null()]).optional(),
  branchId: z.union([z.string(), z.null()]).optional(),
  status: orderStatusSchema,
  discount: z.number().optional().default(0),
  tax: z.number().optional().default(0),
  paymentMethod: z.enum(["cash", "card", "bank", "prepaid", "credit"]).nullable().optional(),
  bankType: z.union([z.string(), z.null()]).optional(),
});

async function computeSubBranchStatusesFromOrderItems(items: any[]): Promise<Record<string, string> | null> {
  const menuItemIds = items
    .map((item: any) => item.menuItemId)
    .filter((id: any) => id && typeof id === "string" && id.trim().length > 0);
  if (menuItemIds.length === 0) return null;
  const menuRows = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, subBranchId: true },
  });
  const subBranchMap = new Map<string, boolean>();
  for (const item of items as any[]) {
    if (item.menuItemId) {
      const menuItem = menuRows.find((m) => m.id === item.menuItemId);
      if (menuItem?.subBranchId) subBranchMap.set(menuItem.subBranchId, true);
    }
  }
  if (subBranchMap.size === 0) return null;
  const subBranchStatuses: Record<string, string> = {};
  for (const subBranchId of subBranchMap.keys()) {
    subBranchStatuses[subBranchId] = "pending";
  }
  return subBranchStatuses;
}

function mergeSubBranchStatuses(
  existing: Record<string, string> | null | undefined,
  computed: Record<string, string> | null
): Record<string, string> | null {
  if (!computed || Object.keys(computed).length === 0) return null;
  const prev = existing && typeof existing === "object" ? { ...existing } : {};
  const next: Record<string, string> = {};
  for (const k of Object.keys(computed)) {
    next[k] = typeof prev[k] === "string" ? prev[k] : "pending";
  }
  return next;
}

/** Inclusive start and exclusive end of the server's local calendar day (used for daily order # reset). */
function localCalendarDayBounds(when: Date): { start: Date; end: Date } {
  const y = when.getFullYear();
  const m = when.getMonth();
  const d = when.getDate();
  const start = new Date(y, m, d, 0, 0, 0, 0);
  const end = new Date(y, m, d + 1, 0, 0, 0, 0);
  return { start, end };
}

export function createOrdersRouter(io: SocketIOServer) {
  const router = Router();

  // Most order operations should be authenticated (role-based restrictions can be expanded later)
  router.use(requireAuth);

  router.get("/", requireAction("view-orders"), async (req, res) => {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const authed = req.user!;

    const bw = branchWhereForRead(authed, branchId);
    if (bw.status) return res.status(bw.status).json({ success: false, error: bw.error });

    // Waiter "own orders only" enforcement (backend, not UI-only).
    if (authed.role === "waiter") {
      const perms = await getRolePermissions("Waiter");
      const ownOnly = (perms.actions?.["view-own-orders"] ?? false) && !(perms.actions?.["view-all-branch-data"] ?? false);
      if (ownOnly) {
        const baseWhere = (bw.where ?? {}) as any;
        const mine = {
          OR: [{ waiterUserId: authed.id }, { waiter: authed.name }],
        };
        const and = Array.isArray(baseWhere.AND) ? baseWhere.AND : [];
        bw.where = { ...baseWhere, AND: [...and, mine] };
      }
    }

    const orders = await prisma.order.findMany({
      where: bw.where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json({ success: true, data: orders });
  });

  router.post("/", requireAction("create-order"), async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }

    const authed = req.user!;
    const resolved = resolveBranchIdForWrite(authed, parsed.data.branchId ?? null);
    if (resolved.status) return res.status(resolved.status).json({ success: false, error: resolved.error });
    const branchId = resolved.branchId;

    // Idempotency: if clientRequestId already exists, return existing order (avoid double clicks)
    if (parsed.data.clientRequestId) {
      const existing = await prisma.order.findUnique({ where: { clientRequestId: parsed.data.clientRequestId } });
      if (existing) {
        return res.status(200).json({ success: true, data: existing, idempotent: true });
      }
    }

    const subtotal = parsed.data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = 0;
    const discount = 0;
    const total = subtotal + tax - discount;

    // Detect sub-branches from menu items and initialize per-sub-branch statuses
    const menuItemIds = parsed.data.items
      .map((item: any) => item.menuItemId)
      .filter((id: any) => id && typeof id === 'string' && id.trim().length > 0);
    
    let subBranchStatuses: Record<string, string> | null = null;
    if (menuItemIds.length > 0) {
      try {
        subBranchStatuses = await computeSubBranchStatusesFromOrderItems(parsed.data.items as any[]);
      } catch (error) {
        console.error("Error detecting sub-branches for order:", error);
      }
    }

    const { start: dayStart, end: dayEnd } = localCalendarDayBounds(new Date());
    const maxOrder = await prisma.order.aggregate({
      where: {
        branchId: branchId ?? null,
        createdAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      _max: { orderNumber: true },
    });
    const nextOrderNumber = (maxOrder._max.orderNumber ?? 0) + 1;

    const orderData: any = {
      orderNumber: nextOrderNumber,
      items: parsed.data.items as unknown as Prisma.InputJsonValue,
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
    };

    // Always include subBranchStatuses, even if null (for proper tracking)
    if (subBranchStatuses) {
      orderData.subBranchStatuses = subBranchStatuses as unknown as Prisma.InputJsonValue;
    } else {
      orderData.subBranchStatuses = null;
    }

    const order = await prisma.order.create({
      data: orderData,
    });

    // Debug: Log order creation with sub-branch info
    if (process.env.NODE_ENV === 'development') {
      console.log('[Order Created]', {
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        subBranchStatuses: order.subBranchStatuses,
        itemsCount: (order.items as any[])?.length || 0,
        firstItemMenuItemId: (order.items as any[])?.[0]?.menuItemId,
      });
    }

    // INSTANT emit - Socket.IO emits are non-blocking, so emit immediately for zero delay
    // Emit to branch-specific room first (targeted, fastest)
    if (order.branchId) {
      io.to(`branch:${order.branchId}`).emit("order:created", order);
    }
    // Also emit globally for admin/cross-branch views
    io.emit("order:created", order);

    return res.status(201).json({ success: true, data: order });
  });

  // Admin full order replace — explicit path so it is never mistaken for other :id routes.
  router.put("/:id/admin", async (req, res) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const orderId = req.params.id;
    const parsed = adminUpdateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }

    try {
      const existing = await prisma.order.findUnique({ where: { id: orderId } });
      if (!existing) return res.status(404).json({ success: false, error: "Order not found" });

      const body = parsed.data;
      const items = body.items as any[];
      const subtotal = items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
      const tax = body.tax ?? 0;
      const discount = body.discount ?? 0;
      const total = subtotal + tax - discount;

      let computedSb: Record<string, string> | null = null;
      try {
        computedSb = await computeSubBranchStatusesFromOrderItems(items);
      } catch (e) {
        console.error(e);
      }
      const subBranchStatusesMerged = mergeSubBranchStatuses(
        (existing.subBranchStatuses as Record<string, string> | null) || undefined,
        computedSb
      );

      const nextBranchId =
        body.branchId !== undefined ? (body.branchId === null ? null : body.branchId) : existing.branchId;

      const table = body.table !== undefined ? body.table : existing.table;
      const customer = body.customer !== undefined ? body.customer : existing.customer;
      const customerId = body.customerId !== undefined ? body.customerId : existing.customerId;
      const waiter = body.waiter !== undefined ? body.waiter : existing.waiter;
      const waiterUserId = body.waiterUserId !== undefined ? body.waiterUserId : existing.waiterUserId;

      const status = body.status;

      let preparedAt: Date | null = (existing.preparedAt as Date | null) ?? null;
      let paidAt: Date | null = (existing.paidAt as Date | null) ?? null;
      let paymentMethod: any = existing.paymentMethod;
      let bankType: string | null = (existing.bankType as string | null) ?? null;

      if (status === "pending" || status === "accepted" || status === "preparing") {
        preparedAt = null;
        paidAt = null;
        paymentMethod = null;
        bankType = null;
      } else if (status === "prepared") {
        preparedAt = existing.preparedAt ? new Date(existing.preparedAt as Date) : new Date();
        paidAt = null;
        paymentMethod = null;
        bankType = null;
      } else if (status === "completed") {
        preparedAt = existing.preparedAt ? new Date(existing.preparedAt as Date) : new Date();
        paidAt = null;
        paymentMethod = null;
        bankType = null;
      } else if (status === "paid") {
        preparedAt = existing.preparedAt ? new Date(existing.preparedAt as Date) : new Date();
        paidAt = existing.paidAt ? new Date(existing.paidAt as Date) : new Date();
        paymentMethod = (body.paymentMethod ?? existing.paymentMethod ?? "cash") as any;
        bankType = paymentMethod === "bank" ? (body.bankType ?? existing.bankType ?? null) : null;
      }

      const order = await prisma.order.update({
        where: { id: orderId },
        data: {
          items: items as unknown as Prisma.InputJsonValue,
          subtotal,
          tax,
          discount,
          total,
          status,
          table: table === null ? null : table === undefined ? undefined : table,
          customer: customer === null ? null : customer === undefined ? undefined : customer,
          customerId: customerId === null ? null : customerId === undefined ? undefined : customerId,
          waiter: waiter === null ? null : waiter === undefined ? undefined : waiter,
          waiterUserId: waiterUserId === null ? null : waiterUserId === undefined ? undefined : waiterUserId,
          branchId: nextBranchId === null ? null : nextBranchId === undefined ? undefined : nextBranchId,
          subBranchStatuses: subBranchStatusesMerged as any,
          preparedAt,
          paidAt,
          paymentMethod: paymentMethod ?? null,
          bankType: bankType ?? null,
        },
      });

      if (order.branchId) {
        io.to(`branch:${order.branchId}`).emit("order:updated", order);
      }
      io.emit("order:updated", order);

      return res.json({ success: true, data: order });
    } catch (e: any) {
      if (e?.code === "P2025") {
        return res.status(404).json({ success: false, error: "Order not found" });
      }
      console.error("admin order update", e);
      return res.status(500).json({ success: false, error: "Failed to update order" });
    }
  });

  router.put("/:id/status", requireAction("update-order-status"), async (req, res) => {
    const orderId = req.params.id;
    const authed = req.user!;
    
    // Support both regular status update and per-sub-branch status update
    const parsed = z.object({ 
      status: orderStatusSchema,
      subBranchId: z.string().optional(), // If provided, update only this sub-branch's status
    }).safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }

    try {
      const status = parsed.data.status;
      const subBranchId = parsed.data.subBranchId;
      
      let updateData: any = {};
      
      if (subBranchId && authed.role === "kitchen") {
        // Kitchen user updating status for their specific sub-branch
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) {
          return res.status(404).json({ success: false, error: "Order not found" });
        }
        
        // Get current sub-branch statuses or initialize
        const currentSubBranchStatuses = (order.subBranchStatuses as Record<string, string> | null) || {};
        currentSubBranchStatuses[subBranchId] = status;
        
        updateData.subBranchStatuses = currentSubBranchStatuses;
        
        // Update main order status based on sub-branch statuses
        // If all sub-branches are prepared, mark order as prepared
        // If any sub-branch is preparing, mark order as preparing
        const allStatuses = Object.values(currentSubBranchStatuses);
        if (allStatuses.every(s => s === "prepared" || s === "completed")) {
          updateData.status = "prepared";
          updateData.preparedAt = new Date();
        } else if (allStatuses.some(s => s === "preparing")) {
          updateData.status = "preparing";
        } else if (allStatuses.some(s => s === "accepted")) {
          updateData.status = "accepted";
        }
      } else {
        // Regular status update (for non-sub-branch orders or admin override)
        updateData.status = status;
        updateData.preparedAt = status === "prepared" ? new Date() : undefined;
        updateData.paidAt = status === "paid" ? new Date() : undefined;
      }
      
      const order = await prisma.order.update({
        where: { id: orderId },
        data: updateData,
      });

      // INSTANT emit BEFORE HTTP response - Socket.IO emits are non-blocking
      // Emit immediately so clients get update before HTTP response completes
      if (order.branchId) {
        io.to(`branch:${order.branchId}`).emit("order:updated", order);
      }
      io.emit("order:updated", order);

      // Send HTTP response after emit (emit is already sent)
      return res.json({ success: true, data: order });
    } catch (e: any) {
      // Prisma "Record to update not found."
      if (e?.code === "P2025") {
        return res.status(404).json({ success: false, error: "Order not found" });
      }
      return res.status(500).json({ success: false, error: "Failed to update order status" });
    }
  });

  // Admin: permanent delete for any status. Waiter/Kitchen: pending only (same branch / own waiter).
  router.delete("/:id", async (req, res) => {
    const orderId = req.params.id;
    const authed = req.user!;

    if (authed.role !== "admin" && authed.role !== "waiter" && authed.role !== "kitchen") {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) return res.status(404).json({ success: false, error: "Order not found" });

    // Non-admins are always restricted to their branch orders.
    if (authed.role !== "admin") {
      const orderBranch = existing.branchId ?? null;
      if (!canAccessBranch(authed, orderBranch)) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
    }

    const isAdmin = authed.role === "admin";

    if (!isAdmin) {
      if (existing.status !== "pending") {
        return res.status(409).json({
          success: false,
          error: "Only pending orders can be removed",
        });
      }

      if (authed.role === "waiter") {
        const matchesById = existing.waiterUserId ? String(existing.waiterUserId) === String(authed.id) : false;
        const matchesByName = existing.waiter ? String(existing.waiter).trim() === String(authed.name).trim() : false;
        if (!matchesById && !matchesByName) {
          return res.status(403).json({ success: false, error: "Forbidden" });
        }
      }
    }

    await prisma.order.delete({ where: { id: orderId } });

    const payload = { id: orderId, branchId: existing.branchId ?? null };
    // INSTANT emit - Socket.IO emits are non-blocking, emit immediately for zero delay
    if (existing.branchId) {
      io.to(`branch:${existing.branchId}`).emit("order:deleted", payload);
    }
    io.emit("order:deleted", payload);

    return res.json({ success: true, data: payload });
  });

  router.post("/:id/payment", async (req, res) => {
    const orderId = req.params.id;
    const parsed = completePaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const existing = await prisma.order.findUnique({ where: { id: orderId } });
      if (!existing) return res.status(404).json({ success: false, error: "Order not found" });
      if (existing.status === "paid") {
        return res.status(409).json({ success: false, error: "Order already paid" });
      }

      // Cashiers are restricted to their allowed branches; admin is unrestricted.
      const authed = req.user!;
      // Only cashier/admin should do this, and cashier must have permission.
      if (authed.role !== "admin" && authed.role !== "cashier") {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
      if (authed.role === "cashier") {
        const perms = await getRolePermissions("Cashier");
        if (!(perms.actions?.["checkout-order"] ?? false)) {
          return res.status(403).json({ success: false, error: "Forbidden" });
        }
      }
      if (authed.role !== "admin" && !canAccessBranch(authed, existing.branchId ?? null)) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }

      const discount = parsed.data.discount ?? 0;
      const total = existing.subtotal - discount;

      const paymentMethod = parsed.data.paymentMethod;

      const result = await prisma.$transaction(async (tx) => {
        // Prepaid/Credit deductions
        if (paymentMethod === "prepaid" || paymentMethod === "credit") {
          const customerId = existing.customerId ? String(existing.customerId) : "";
          if (!customerId) {
            throw Object.assign(new Error("customerId is required for prepaid/credit payments"), { status: 400 });
          }

          const customer = await tx.customer.findUnique({ where: { id: customerId } });
          if (!customer) throw Object.assign(new Error("Customer not found"), { status: 404 });

          if (paymentMethod === "prepaid") {
            if (customer.accountType !== "prepaid") {
              throw Object.assign(new Error("Customer is not a prepaid account"), { status: 409 });
            }
            const balance = customer.balance ?? 0;
            if (balance < total) {
              throw Object.assign(new Error("Insufficient prepaid balance"), { status: 409 });
            }
            await tx.customer.update({ where: { id: customer.id }, data: { balance: balance - total } });
          } else {
            if (customer.accountType !== "credit") {
              throw Object.assign(new Error("Customer is not a credit account"), { status: 409 });
            }
            const limit = customer.creditLimit ?? 0;
            const used = customer.creditUsed ?? 0;
            const available = limit - used;
            if (available < total) {
              throw Object.assign(new Error("Insufficient credit limit"), { status: 409 });
            }
            await tx.customer.update({ where: { id: customer.id }, data: { creditUsed: used + total } });
          }
        }

        const order = await tx.order.update({
          where: { id: orderId },
          data: {
            paymentMethod,
            bankType: parsed.data.bankType,
            tax: 0,
            discount,
            total,
            status: "paid",
            paidAt: new Date(),
          },
        });

        return order;
      });

      // INSTANT emit - Socket.IO emits are non-blocking, emit immediately for zero delay
      if (result.branchId) {
        io.to(`branch:${result.branchId}`).emit("order:updated", result);
      }
      io.emit("order:updated", result);

      return res.json({ success: true, data: result });
    } catch (e: any) {
      if (typeof e?.status === "number") {
        return res.status(e.status).json({ success: false, error: e.message });
      }
      return res.status(500).json({ success: false, error: "Failed to complete payment" });
    }
  });

  // Allow cashier/admin to correct payment method after checkout (customer request)
  router.put("/:id/payment-method", async (req, res) => {
    // Only cashier/admin should do this
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "cashier")) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    if (req.user.role === "cashier") {
      const perms = await getRolePermissions("Cashier");
      if (!(perms.actions?.["checkout-order"] ?? false)) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
    }

    const orderId = req.params.id;
    const parsed = updatePaymentMethodSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    try {
      const existing = await prisma.order.findUnique({ where: { id: orderId } });
      if (!existing) return res.status(404).json({ success: false, error: "Order not found" });

      const authed = req.user!;
      if (authed.role !== "admin" && !canAccessBranch(authed, existing.branchId ?? null)) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }

      const paymentMethod = parsed.data.paymentMethod;
      const bankType = paymentMethod === "bank" ? (parsed.data.bankType ?? existing.bankType ?? null) : null;

      const order = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentMethod,
          bankType,
        },
      });

      // INSTANT emit - Socket.IO emits are non-blocking, emit immediately for zero delay
      if (order.branchId) {
        io.to(`branch:${order.branchId}`).emit("order:updated", order);
      }
      io.emit("order:updated", order);

      return res.json({ success: true, data: order });
    } catch {
      return res.status(500).json({ success: false, error: "Failed to update payment method" });
    }
  });

  return router;
}


