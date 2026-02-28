import { Router } from "express";
import { prisma } from "../prisma";

export function createPublicRouter() {
  const router = Router();

  // Public branches endpoint for login page quick-select (no authentication required)
  router.get("/branches", async (_req, res) => {
    try {
      const branches = await prisma.branch.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        take: 200,
      });
      return res.json({ success: true, data: branches });
    } catch (error) {
      console.error("Error fetching public branches:", error);
      return res.status(500).json({ success: false, error: "Failed to load branches" });
    }
  });

  // Minimal user list for quick-select UI (no passwords).
  router.get("/users", async (req, res) => {
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;

    const where: any = {};
    if (role) where.role = role;
    if (branchId) where.branchId = branchId;

    const users = await prisma.user.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, role: true, branchId: true, avatarUrl: true, createdAt: true },
      take: 200,
    });

    return res.json({ success: true, data: users });
  });

  return router;
}




