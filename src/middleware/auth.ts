import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { prisma } from "../prisma";

export type AuthedUser = {
  id: string;
  role: "admin" | "cashier" | "kitchen" | "waiter";
  branchId?: string | null;
  // null/undefined => all branches
  // [] => none configured (treated as no access)
  // ["b1","b2"] => can access those branches
  allowedBranchIds?: string[] | null;
  email: string;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return res.status(401).json({ success: false, error: "Missing auth token" });

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthedUser;

    // IMPORTANT: do not rely solely on JWT payload for branch authorization.
    // Tokens can become stale if an admin assigns/moves a user to a branch after login.
    // Fetch the latest user record so branchId/role are always correct.
    void (async () => {
      try {
        // This query may fail if DB migrations haven't been applied yet.
        // In that case, fall back to legacy branchId-only behavior.
        let dbUser:
          | ({
              id: string;
              role: any;
              branchId: string | null;
              email: string;
              name: string;
              branchAccesses?: Array<{ branchId: string }>;
            } | null)
          | null = null;

        try {
          dbUser = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
              id: true,
              role: true,
              branchId: true,
              email: true,
              name: true,
              branchAccesses: { select: { branchId: true } },
            },
          });
        } catch (e: any) {
          // Prisma "table does not exist" / missing migration
          if (e?.code === "P2021") {
            dbUser = await prisma.user.findUnique({
              where: { id: decoded.id },
              select: { id: true, role: true, branchId: true, email: true, name: true },
            });
          } else {
            throw e;
          }
        }
        if (!dbUser) return res.status(401).json({ success: false, error: "Invalid or expired token" });

        const accessIds = Array.isArray((dbUser as any).branchAccesses)
          ? (dbUser as any).branchAccesses.map((r: any) => String(r.branchId))
          : [];

        // Derive branch scope:
        // - admin: all branches
        // - non-admin with explicit access rows: those branches
        // - non-admin with legacy branchId: that one branch
        // - non-admin with branchId null and no access rows: all branches
        const role = dbUser.role as AuthedUser["role"];
        const legacyBranchId = (dbUser.branchId ?? null) as string | null;
        let allowedBranchIds: string[] | null | undefined = undefined;
        if (role === "admin") allowedBranchIds = null;
        else if (accessIds.length > 0) allowedBranchIds = accessIds;
        else if (legacyBranchId) allowedBranchIds = [legacyBranchId];
        else allowedBranchIds = null;

        req.user = {
          id: dbUser.id,
          role,
          branchId: legacyBranchId,
          allowedBranchIds,
          email: dbUser.email,
          name: dbUser.name,
        };
        return next();
      } catch {
        return res.status(401).json({ success: false, error: "Invalid or expired token" });
      }
    })();
    return;
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

export function requireRole(roles: AuthedUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    return next();
  };
}




