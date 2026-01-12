import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().optional(),
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




