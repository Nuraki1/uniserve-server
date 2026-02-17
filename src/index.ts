// Environment variables:
// - In production (cPanel/Passenger), env vars are typically provided by the hosting panel.
// - For local dev or when panel env isn't set, we load a `.env` file.
//
// IMPORTANT: do not rely on `process.cwd()` because cPanel/Passenger often starts the app
// with a different working directory. Instead, try both:
// - `<appRoot>/.env` (via cwd)
// - `<appRoot>/.env` (via __dirname, which is `dist/` in production builds)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require("dotenv");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");

  const missingRequired = !process.env.DATABASE_URL?.trim() || !process.env.JWT_SECRET?.trim();
  if (process.env.NODE_ENV !== "production" || missingRequired) {
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(__dirname, "..", ".env"),
    ];
    for (const p of candidates) {
      const loaded = dotenv.config({ path: p });
      if (!loaded.error) break;
    }
  }
} catch {
  // dotenv is optional; env.ts will validate and print a clear error if vars are missing.
}
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { env } from "./env";
import { attachRealtime } from "./realtime";
import { createOrdersRouter } from "./routes/orders";
import { createAuthRouter } from "./routes/auth";
import { createAdminRouter } from "./routes/admin";
import { createPublicRouter } from "./routes/public";
import { createMenuItemsRouter } from "./routes/menu-items";
import { createBranchesRouter } from "./routes/branches";
import { createUsersRouter } from "./routes/users";
import { createCustomersRouter } from "./routes/customers";
import { createTablesRouter } from "./routes/tables";
import { createPermissionsRouter } from "./routes/permissions";
import { createCommonCommentsRouter } from "./routes/common-comments";

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function normalizeOrigin(origin: string): string {
  let o = stripOuterQuotes(origin);
  // Most origins won't include a trailing slash, but env values often do.
  if (o.endsWith("/")) o = o.slice(0, -1);
  return o;
}

function computeAllowedOrigins(clientOrigin: string | undefined): true | string[] {
  if (!clientOrigin?.trim()) return true;
  const parts = stripOuterQuotes(clientOrigin)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts.map(normalizeOrigin) : true;
}

function isLocalhostLikeOrigin(origin: string): boolean {
  // Support common hybrid-app shells and local dev origins.
  // Examples: capacitor://localhost, ionic://localhost, app://localhost, http://localhost:5173
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (["capacitor:", "ionic:", "app:"].includes(u.protocol) && u.hostname === "localhost") return true;
    return false;
  } catch {
    return false;
  }
}

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
const allowedOrigins = computeAllowedOrigins(env.CLIENT_ORIGIN);

// Private Network Access (PNA) preflight support (optional).
// Chrome may send `Access-Control-Request-Private-Network: true` when calling a local/private IP.
app.use((req, res, next) => {
  if (
    env.CORS_ALLOW_PRIVATE_NETWORK?.trim() &&
    req.headers["access-control-request-private-network"] === "true"
  ) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
});

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    // Allow non-browser clients (curl/postman) that don't send Origin
    if (!origin) return cb(null, true);

    const normalized = normalizeOrigin(origin);

    // Kiosk shells / file:// webviews sometimes send `Origin: null`
    if (normalized === "null" && env.CORS_ALLOW_NULL_ORIGIN?.trim()) return cb(null, true);

    // Optional: allow common localhost-like origins for mobile/hybrid shells or dev
    if (env.CORS_ALLOW_LOCALHOST_ORIGINS?.trim() && isLocalhostLikeOrigin(normalized)) return cb(null, true);

    if (allowedOrigins === true) return cb(null, true);
    return cb(null, allowedOrigins.includes(normalized));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // NOTE: Leaving `allowedHeaders` undefined lets `cors` reflect requested headers on preflight.
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(cors(corsOptions));
// IMPORTANT: preflight must use the same options as the main CORS middleware.
app.options("*", cors(corsOptions));

// Optional static folders for images/uploads when deployed under Passenger/cPanel.
// These are no-ops if the folders don't exist in the deployment.
const staticCandidates: Array<{ mount: string; dir: string }> = [
  { mount: "/images", dir: path.resolve(__dirname, "..", "images") },
  { mount: "/uploads", dir: path.resolve(__dirname, "..", "uploads") },
];
for (const c of staticCandidates) {
  if (fs.existsSync(c.dir)) {
    app.use(
      c.mount,
      express.static(c.dir, {
        etag: true,
        maxAge: "30d",
        setHeaders: (res, filePath) => {
          if (/\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(filePath)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      })
    );
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.json({ ok: true, service: "uniserve-api" }));

const server = http.createServer(app);
const io = attachRealtime(server, { corsOrigin: allowedOrigins });

app.use("/api/auth", createAuthRouter());
app.use("/api/admin", createAdminRouter());
app.use("/api/public", createPublicRouter());
app.use("/api/users", createUsersRouter());
app.use("/api/orders", createOrdersRouter(io));
app.use("/api/menu-items", createMenuItemsRouter());
app.use("/api/branches", createBranchesRouter());
app.use("/api/customers", createCustomersRouter());
app.use("/api/tables", createTablesRouter());
app.use("/api/permissions", createPermissionsRouter());
app.use("/api/common-comments", createCommonCommentsRouter());

// JSON 404s (keeps clients from seeing HTML error pages/proxies).
app.use("/api", (_req, res) => res.status(404).json({ success: false, error: "Not found" }));

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${env.PORT}`);
});