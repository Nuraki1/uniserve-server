// In production (cPanel/Passenger), environment variables should be provided by the hosting panel.
// For local dev, we optionally load `.env` via dotenv if it's installed.
if (process.env.NODE_ENV !== "production") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config();
  } catch {
    // dotenv is optional in non-production
  }
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

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
const allowedOrigins = computeAllowedOrigins(env.CLIENT_ORIGIN);
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients (curl/postman) that don't send Origin
      if (!origin) return cb(null, true);
      if (allowedOrigins === true) return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  })
);
app.options("*", cors());

app.get("/health", (_req, res) => res.json({ ok: true }));

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

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${env.PORT}`);
});




