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

function computeAllowedOrigins(clientOrigin: string | undefined): true | string[] {
  if (!clientOrigin?.trim()) return true;
  const parts = clientOrigin
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : true;
}

function truthy(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));

const allowedOrigins = computeAllowedOrigins(env.CLIENT_ORIGIN);
const allowNullOrigin = truthy(env.CORS_ALLOW_NULL_ORIGIN);
const allowLocalhostOrigins = truthy(env.CORS_ALLOW_LOCALHOST_ORIGINS);
const allowPrivateNetwork = truthy(env.CORS_ALLOW_PRIVATE_NETWORK);

const isOriginAllowed = (origin: string | undefined): boolean => {
  // Allow non-browser clients (curl/postman) that don't send Origin
  if (!origin) return true;

  // Kiosk apps served from `file://` often send Origin: "null"
  if (origin === "null") return allowNullOrigin;

  // Custom schemes used by embedded webviews (Capacitor/Ionic/Electron-like)
  if (allowLocalhostOrigins) {
    if (origin === "capacitor://localhost" || origin === "ionic://localhost" || origin === "app://localhost") {
      return true;
    }
  }

  // Optional localhost http(s) origins for local kiosk shells/dev tools.
  try {
    const u = new URL(origin);
    if (allowLocalhostOrigins) {
      if (u.protocol === "http:" || u.protocol === "https:") {
        if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
      }
    }
  } catch {
    // Non-URL origins: fall through to list check
  }

  // Browser behavior as before:
  // - if CLIENT_ORIGIN is unset/empty => allow all origins (allowedOrigins === true)
  // - otherwise only allow exact matches from the allow-list
  if (allowedOrigins === true) return true;
  return allowedOrigins.includes(origin);
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
  ],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

// Private Network Access (PNA) support (Chrome): allow preflight for LAN targets when requested.
// See: https://developer.chrome.com/blog/private-network-access-preflight/
app.use((req, res, next) => {
  const pna = String(req.headers["access-control-request-private-network"] ?? "").toLowerCase();
  // Only enable this when explicitly requested for kiosk/LAN scenarios.
  if (pna === "true" && allowPrivateNetwork) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
// Socket.IO uses the same origin allow-list rules as HTTP.
const io = attachRealtime(server, {
  corsOrigin: (origin, cb) => cb(null, isOriginAllowed(origin)),
});

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

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${env.PORT}`);
});




