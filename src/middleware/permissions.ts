import type { Request, Response, NextFunction } from "express";
import { getRolePermissions, type PermissionRoleName } from "../utils/permissions-store";

function toPermissionRoleName(role: string): PermissionRoleName | null {
  if (role === "cashier") return "Cashier";
  if (role === "kitchen") return "Kitchen";
  if (role === "waiter") return "Waiter";
  return null;
}

export function requireAction(actionKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authed = req.user;
    if (!authed) return res.status(401).json({ success: false, error: "Unauthorized" });

    // Admin bypasses matrix
    if (authed.role === "admin") return next();

    const roleName = toPermissionRoleName(authed.role);
    if (!roleName) return res.status(403).json({ success: false, error: "Forbidden" });

    const perms = await getRolePermissions(roleName);
    const ok = perms?.actions?.[actionKey] ?? false;
    if (!ok) return res.status(403).json({ success: false, error: "Forbidden" });
    return next();
  };
}








