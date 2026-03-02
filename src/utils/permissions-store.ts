import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export type PermissionRoleName = "Cashier" | "Kitchen" | "Waiter";

export type RolePermissions = {
  sections: Record<string, boolean>;
  actions: Record<string, boolean>;
};

export type PermissionsState = Record<PermissionRoleName, RolePermissions>;

// Defaults should match the intended system analogy:
// - Waiter: can create orders but sees own orders only by default.
// - Cashier/Kitchen: branch-scoped by assignment; no cross-branch implied by permissions.
export const DEFAULT_PERMISSIONS: PermissionsState = {
  Cashier: {
    sections: { "new-order": true, status: true, checkout: true, accounts: true, history: true },
    actions: {
      "create-order": true,
      "view-orders": true,
      "update-order-status": false,
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
      // Default: waiters should NOT see other waiters' orders unless explicitly enabled.
      "view-all-branch-data": false,
    },
  },
};

function mergeWithDefaults(role: PermissionRoleName, fromDb: any | undefined): RolePermissions {
  const base = DEFAULT_PERMISSIONS[role];
  return {
    sections: { ...base.sections, ...(fromDb?.sections ?? {}) },
    actions: { ...base.actions, ...(fromDb?.actions ?? {}) },
  };
}

export async function ensurePermissionsDefaults() {
  let existing: any[] = [];
  try {
    existing = await prisma.rolePermissions.findMany();
  } catch (e: any) {
    if (e?.code === "P2021") return { ok: false as const, reason: "missing_table" as const };
    throw e;
  }
  const byRole = new Map(existing.map((r) => [r.role, r]));
  const roles: PermissionRoleName[] = ["Cashier", "Kitchen", "Waiter"];
  for (const role of roles) {
    if (byRole.has(role as any)) continue;
    const data = DEFAULT_PERMISSIONS[role];
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

export async function loadPermissionsMatrix(): Promise<{ ok: true; data: PermissionsState } | { ok: false; data: PermissionsState; warning: string }> {
  const ensured = await ensurePermissionsDefaults();
  if (!ensured.ok) {
    return { ok: false, data: DEFAULT_PERMISSIONS, warning: "Permissions table missing. Run Prisma migration to persist permission changes." };
  }

  const rows = await prisma.rolePermissions.findMany();
  const map: any = {};
  for (const r of rows) {
    map[r.role] = mergeWithDefaults(r.role as PermissionRoleName, r);
  }

  // Ensure all roles exist (and are merged)
  const data: PermissionsState = {
    Cashier: mergeWithDefaults("Cashier", map.Cashier),
    Kitchen: mergeWithDefaults("Kitchen", map.Kitchen),
    Waiter: mergeWithDefaults("Waiter", map.Waiter),
  };

  return { ok: true, data };
}

export async function getRolePermissions(role: PermissionRoleName): Promise<RolePermissions> {
  const matrix = await loadPermissionsMatrix();
  return matrix.data[role];
}







