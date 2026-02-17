import { z } from "zod";

// NOTE (cPanel/Passenger):
// If the process exits during boot, Passenger will surface it as "503 Service Unavailable".
// So we NEVER `process.exit()` here. Instead we expose an `envStatus` you can inspect.

const envSchema = z.object({
  // These are required for the full API to work, but we treat them as "soft-required"
  // so the server can still start and return a helpful JSON 503 until configured.
  DATABASE_URL: z.string().optional().default(""),
  JWT_SECRET: z.string().optional().default(""),

  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().optional(),

  BOOTSTRAP_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

type Env = z.infer<typeof envSchema>;

function computeMissing(e: Env): string[] {
  const missing: string[] = [];
  if (!e.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (!e.JWT_SECRET?.trim() || e.JWT_SECRET.trim().length < 16) missing.push("JWT_SECRET");
  return missing;
}

export const env: Env = parsed.success
  ? parsed.data
  : ({
      PORT: 4000,
    } as Env);

export const envStatus = (() => {
  if (!parsed.success) {
    return {
      ok: false as const,
      missing: ["DATABASE_URL", "JWT_SECRET"],
      message: parsed.error.message,
    };
  }
  const missing = computeMissing(parsed.data);
  if (missing.length) {
    return {
      ok: false as const,
      missing,
      message:
        "Missing required env vars for full API. Set them in cPanel Node.js App env vars or server/.env.",
    };
  }
  return { ok: true as const, missing: [] as string[], message: "OK" };
})();




