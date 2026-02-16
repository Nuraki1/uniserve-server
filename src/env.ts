import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().optional(),
  // Kiosk / embedded webview compatibility flags (all optional)
  // - Some kiosk apps run from `file://` which sends `Origin: null`
  // - Some run from custom schemes like `capacitor://localhost` / `ionic://localhost`
  // - Some deployments call a LAN server (e.g. http://192.168.x.x) from a secure origin which triggers
  //   Chrome Private Network Access (PNA) preflight requiring `Access-Control-Allow-Private-Network: true`
  CORS_ALLOW_NULL_ORIGIN: z.string().optional(), // "1" | "true"
  CORS_ALLOW_LOCALHOST_ORIGINS: z.string().optional(), // "1" | "true"
  CORS_ALLOW_PRIVATE_NETWORK: z.string().optional(), // "1" | "true"
  JWT_SECRET: z.string().min(16),
  BOOTSTRAP_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    [
      "",
      "❌ Server env is missing/invalid. Create `server/.env` with at least:",
      '  DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/restaurantinternal"',
      '  JWT_SECRET="a-long-random-secret-at-least-16-chars"',
      "",
      "Optional:",
      '  PORT=4000',
      '  CLIENT_ORIGIN="http://localhost:3000"',
      '  BOOTSTRAP_TOKEN="one-time-secret-for-bootstrap-admin"',
      "",
      "Details:",
      parsed.error.message,
      "",
    ].join("\n")
  );
  process.exit(1);
}

export const env = parsed.data;




