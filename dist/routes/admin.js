import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
const createUserSchema = z
    .object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: z.enum(["admin", "cashier", "kitchen", "waiter"]),
    branchId: z.string().optional(),
})
    .superRefine((data, ctx) => {
    if (data.role !== "admin" && (!data.branchId || data.branchId.trim().length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "branchId is required for non-admin users",
            path: ["branchId"],
        });
    }
});
const updateUserSchema = z.object({
    name: z.string().min(1).optional(),
    branchId: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
});
const updatePasswordSchema = z.object({
    password: z.string().min(6),
});
export function createAdminRouter() {
    const router = Router();
    router.use(requireAuth, requireRole(["admin"]));
    router.post("/users", async (req, res) => {
        const parsed = createUserSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ success: false, error: parsed.error.message });
        const email = parsed.data.email.toLowerCase();
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists)
            return res.status(400).json({ success: false, error: "Email already exists" });
        const passwordHash = await bcrypt.hash(parsed.data.password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name: parsed.data.name,
                role: parsed.data.role,
                branchId: parsed.data.role === "admin" ? null : (parsed.data.branchId ?? null),
            },
        });
        return res.status(201).json({
            success: true,
            data: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId, createdAt: user.createdAt },
        });
    });
    router.get("/users", async (_req, res) => {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            select: { id: true, email: true, name: true, role: true, branchId: true, createdAt: true, avatarUrl: true },
        });
        return res.json({ success: true, data: users });
    });
    router.put("/users/:id", async (req, res) => {
        const parsed = updateUserSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ success: false, error: parsed.error.message });
        try {
            const user = await prisma.user.update({
                where: { id: req.params.id },
                data: {
                    ...(parsed.data.name ? { name: parsed.data.name } : {}),
                    ...(parsed.data.branchId !== undefined ? { branchId: parsed.data.branchId } : {}),
                    ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
                },
                select: { id: true, email: true, name: true, role: true, branchId: true, createdAt: true, avatarUrl: true },
            });
            return res.json({ success: true, data: user });
        }
        catch {
            return res.status(404).json({ success: false, error: "User not found" });
        }
    });
    router.put("/users/:id/password", async (req, res) => {
        const parsed = updatePasswordSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ success: false, error: parsed.error.message });
        const passwordHash = await bcrypt.hash(parsed.data.password, 10);
        try {
            await prisma.user.update({
                where: { id: req.params.id },
                data: { passwordHash },
            });
            return res.json({ success: true });
        }
        catch {
            return res.status(404).json({ success: false, error: "User not found" });
        }
    });
    router.delete("/users/:id", async (req, res) => {
        try {
            await prisma.user.delete({ where: { id: req.params.id } });
            return res.json({ success: true });
        }
        catch {
            return res.status(404).json({ success: false, error: "User not found" });
        }
    });
    return router;
}
