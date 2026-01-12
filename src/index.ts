import "dotenv/config";
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

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: env.CLIENT_ORIGIN ?? true,
    credentials: true,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = attachRealtime(server, { corsOrigin: env.CLIENT_ORIGIN });

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




