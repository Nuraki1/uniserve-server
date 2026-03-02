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

  // process

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
import { env, envStatus } from "./env";
import { attachRealtime } from "./realtime";
// Routes are imported lazily to avoid blocking module load

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

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
const allowedOrigins = computeAllowedOrigins(env.CLIENT_ORIGIN);

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    // Allow non-browser clients (curl/postman) that don't send Origin
    if (!origin) return cb(null, true);

    const normalized = normalizeOrigin(origin);

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
// Use try-catch to avoid blocking on filesystem operations
const staticCandidates: Array<{ mount: string; dir: string }> = [
  { mount: "/images", dir: path.resolve(__dirname, "..", "images") },
  { mount: "/uploads", dir: path.resolve(__dirname, "..", "uploads") },
];
for (const c of staticCandidates) {
  try {
    // Use a quick existence check - if it fails or is slow, skip it
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
  } catch {
    // Skip static folder if there's any error (permissions, etc.)
    // This prevents blocking during startup
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.json({ ok: true, service: "uniserve-api" }));
app.get("/__env", (_req, res) => {
  // Intentionally do not leak secrets; this is just to confirm the process is running and env is set.
  return res.json({
    ok: true,
    envOk: envStatus.ok,
    missing: envStatus.missing,
    nodeEnv: process.env.NODE_ENV,
  });
});

// Passenger/cPanel compatibility: Passenger manages the HTTP server.
// Check if we're running under Passenger (only check for actual Passenger environment variables)
// Don't use NODE_ENV or PORT as indicators - those can be set in local development too
const isPassenger = !!(
  process.env.PASSENGER_APP_ENV ||
  process.env.PASSENGER_SOCKET_FILE ||
  process.env.PHUSION_PASSENGER_VERSION
);

let server: http.Server;
let io: ReturnType<typeof attachRealtime> | undefined;

// Create HTTP server for Socket.IO support
server = http.createServer(app);

// Setup routes - must complete before module export for Passenger
// This function sets up all API routes synchronously
function setupRoutes() {
  if (!envStatus.ok) {
    app.use("/api", (_req, res) =>
      res.status(503).json({
        success: false,
        error: "Server is not configured yet",
        missing: envStatus.missing,
      })
    );
    return;
  }

  try {
    // Import routes - using require() to avoid top-level import blocking
    // but doing it synchronously here to ensure routes are ready before export
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAuthRouter } = require("./routes/auth");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAdminRouter } = require("./routes/admin");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createPublicRouter } = require("./routes/public");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createUsersRouter } = require("./routes/users");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createOrdersRouter } = require("./routes/orders");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMenuItemsRouter } = require("./routes/menu-items");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createBranchesRouter } = require("./routes/branches");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSubBranchesRouter } = require("./routes/sub-branches");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCustomersRouter } = require("./routes/customers");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createTablesRouter } = require("./routes/tables");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createPermissionsRouter } = require("./routes/permissions");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCommonCommentsRouter } = require("./routes/common-comments");

    // Initialize Socket.IO for realtime features
    io = attachRealtime(server, { corsOrigin: allowedOrigins });

    // Register all API routes
    app.use("/api/auth", createAuthRouter());
    app.use("/api/admin", createAdminRouter());
    app.use("/api/public", createPublicRouter());
    app.use("/api/users", createUsersRouter());
    app.use("/api/orders", createOrdersRouter(io));
    app.use("/api/menu-items", createMenuItemsRouter());
    app.use("/api/branches", createBranchesRouter());
    app.use("/api/sub-branches", createSubBranchesRouter());
    app.use("/api/customers", createCustomersRouter());
    app.use("/api/tables", createTablesRouter());
    app.use("/api/permissions", createPermissionsRouter());
    app.use("/api/common-comments", createCommonCommentsRouter());

    // JSON 404s for unmatched API routes (keeps clients from seeing HTML error pages/proxies).
    app.use("/api", (_req, res) => res.status(404).json({ success: false, error: "Not found" }));
    
    // eslint-disable-next-line no-console
    console.log("API routes initialized successfully");
  } catch (error) {
    // If route setup fails, log the error and set up a fallback handler
    // eslint-disable-next-line no-console
    console.error("Error setting up API routes:", error);
    // Log the full error stack for debugging
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error("Error stack:", error.stack);
    }
    app.use("/api", (_req, res) =>
      res.status(503).json({
        success: false,
        error: "Server initialization error",
        message: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      })
    );
  }
}

// Add a test endpoint to verify API is accessible (before route setup)
app.get("/api/test", (_req, res) => {
  res.json({
    ok: true,
    message: "API is accessible",
    timestamp: new Date().toISOString(),
    envOk: envStatus.ok,
    routesSetup: true,
  });
});

// Set up routes synchronously BEFORE exporting the app
// This ensures all routes are registered when Passenger loads the module
setupRoutes();

// For Passenger: export the app (Passenger will handle the server and call app(req, res))
// For standalone: listen on the port
// Only export for Passenger if actually running under Passenger (detected via environment variables)
// Otherwise, always start the server in standalone mode (works for both dev and production)
if (isPassenger) {
  // Passenger mode: export the app directly
  // Passenger will manage the HTTP server and call the app with (req, res)
  // Socket.IO server is created but Passenger will route HTTP requests through the Express app
  // eslint-disable-next-line no-console
  console.log("Exporting Express app for Passenger");
  module.exports = app;
} else {
  // Standalone mode: start listening on the port (works for both dev and production)
  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on :${env.PORT}`);
  });
}