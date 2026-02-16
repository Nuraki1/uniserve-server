import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { prisma } from "../prisma";

export type AuthedUser = {
  id: string;
  role: "admin" | "cashier" | "kitchen" | "waiter";
  branchId?: string | null;
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
        const dbUser = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: { id: true, role: true, branchId: true, email: true, name: true },
        });
        if (!dbUser) return res.status(401).json({ success: false, error: "Invalid or expired token" });

        req.user = {
          id: dbUser.id,
          role: dbUser.role as AuthedUser["role"],
          branchId: dbUser.branchId,
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




