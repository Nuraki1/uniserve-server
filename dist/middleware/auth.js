import jwt from "jsonwebtoken";
import { env } from "../env";
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token)
        return res.status(401).json({ success: false, error: "Missing auth token" });
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        req.user = decoded;
        return next();
    }
    catch {
        return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }
}
export function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user)
            return res.status(401).json({ success: false, error: "Unauthorized" });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: "Forbidden" });
        }
        return next();
    };
}
