import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const roleSchema = z.enum(["Cashier", "Kitchen", "Waiter"]);

const rolePermissionsSchema = z.object({
  sections: z.record(z.boolean()),
  actions: z.record(z.boolean()),
});

const permissionsStateSchema = z.object({
  Cashier: rolePermissionsSchema,
  Kitchen: rolePermissionsSchema,
  Waiter: rolePermissionsSchema,
});

const DEFAULT_PERMISSIONS = {
  Cashier: {
    sections: { "new-order": true, status: true, checkout: true, accounts: true, history: true },
    actions: {
      "create-order": true,
      "view-orders": true,
      "update-order-status": true,
      "checkout-order": true,
      "manage-customer-accounts": true,
      "view-history": true,
      "view-all-branch-data": true,
    },
  },
  Kitchen: {
    sections: { orders: true, availability: true, analytics: true },
    actions: {
      "view-orders": true,
      "update-order-status": true,
      "view-order-details": true,
      "manage-menu-availability": true,
      "view-analytics": true,
      "view-all-branch-data": true,
    },
  },
  Waiter: {
    sections: { "new-order": true, status: true, history: true },
    actions: {
      "create-order": true,
      "view-orders": true,
      "view-own-orders": true,
      "view-history": true,
      "view-all-branch-data": true,
    },
  },
} as const;

async function ensureDefaults() {
  let existing: any[] = [];
  try {
    existing = await prisma.rolePermissions.findMany();
  } catch (e: any) {
    // If DB wasn't migrated yet, Prisma throws P2021 "table does not exist".
    // Don't crash the server; allow the route to respond with defaults + instructions.
    if (e?.code === "P2021") {
      return { ok: false as const, reason: "missing_table" as const };
    }
    throw e;
  }
  const byRole = new Map(existing.map(r => [r.role, r]));

  const roles: Array<z.infer<typeof roleSchema>> = ["Cashier", "Kitchen", "Waiter"];
  for (const role of roles) {
    if (byRole.has(role as any)) continue;
    const data = (DEFAULT_PERMISSIONS as any)[role];
    await prisma.rolePermissions.create({
      data: {
        role: role as any,
        sections: data.sections as Prisma.InputJsonValue,
        actions: data.actions as Prisma.InputJsonValue,
      },
    });
  }

  return { ok: true as const };
}

export function createPermissionsRouter() {
  const router = Router();
  router.use(requireAuth);

  // Read permissions: admin gets full matrix; other roles get their own role's permissions only.
  router.get("/", async (req, res) => {
    const authed = req.user!;
    const ensured = await ensureDefaults();
    if (!ensured.ok) {
      // DB not migrated yet; serve defaults from code so app can still boot.
      if (authed.role === "admin") {
        return res.json({
          success: true,
          data: DEFAULT_PERMISSIONS,
          warning: "Permissions table missing. Run Prisma migration to persist permission changes.",
        });
      }
      const roleName = authed.role === "cashier" ? "Cashier" : authed.role === "kitchen" ? "Kitchen" : "Waiter";
      return res.json({
        success: true,
        data: { [roleName]: (DEFAULT_PERMISSIONS as any)[roleName] },
        warning: "Permissions table missing. Run Prisma migration to persist permission changes.",
      });
    }

    const rows = await prisma.rolePermissions.findMany();
    const map: any = {};
    for (const r of rows) map[r.role] = { sections: r.sections, actions: r.actions };

    if (authed.role === "admin") {
      return res.json({ success: true, data: map });
    }

    const roleName = authed.role === "cashier" ? "Cashier" : authed.role === "kitchen" ? "Kitchen" : "Waiter";
    return res.json({ success: true, data: { [roleName]: map[roleName] } });
  });

  // Update full matrix (admin only)
  router.put("/", requireRole(["admin"]), async (req, res) => {
    const parsed = permissionsStateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message });

    const ensured = await ensureDefaults();
    if (!ensured.ok) {
      return res.status(503).json({
        success: false,
        error: "Permissions table missing. Run Prisma migration (prisma migrate dev) then retry.",
      });
    }

    const entries = Object.entries(parsed.data) as Array<[z.infer<typeof roleSchema>, any]>;
    for (const [role, value] of entries) {
      await prisma.rolePermissions.update({
        where: { role: role as any },
        data: {
          sections: value.sections as Prisma.InputJsonValue,
          actions: value.actions as Prisma.InputJsonValue,
        },
      });
    }

    return res.json({ success: true });
  });

  return router;
}


