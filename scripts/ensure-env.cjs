/* eslint-disable no-console */
/**
 * Ensures `.env` exists for Prisma CLI commands.
 *
 * - If `.env` is missing but `env.example` exists, it copies `env.example` → `.env`.
 * - Validates required env vars are present (at least DATABASE_URL for Prisma schema validation).
 *
 * This prevents confusing Prisma errors like:
 *   Environment variable not found: DATABASE_URL (P1012)
 */

const fs = require("fs");
const path = require("path");

const dotenv = require("dotenv");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT, "env.example");

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isPlaceholderDatabaseUrl(value) {
  if (!value) return true;
  // Matches the placeholder used in env.example:
  // mysql://USER:PASSWORD@HOST:3306/DB_NAME
  return /mysql:\/\/USER:PASSWORD@HOST:3306\/DB_NAME/i.test(value);
}

// In production (cPanel), environment variables are set by Passenger/cPanel,
// so we don't need a .env file. Only create/load .env in development.
if (process.env.NODE_ENV !== "production") {
  if (!fileExists(ENV_PATH)) {
    if (fileExists(ENV_EXAMPLE_PATH)) {
      fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
      console.log(
        "[env] Created .env from env.example. Update DATABASE_URL (and other vars) before retrying."
      );
    } else {
      console.error(
        "[env] Missing .env and env.example. Create a .env file in nice-server with DATABASE_URL set."
      );
      process.exit(1);
    }
  }
  // Load env file into process.env so we can validate and so downstream tools inherit it.
  dotenv.config({ path: ENV_PATH });
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl || isPlaceholderDatabaseUrl(dbUrl)) {
  const errorMsg = process.env.NODE_ENV === "production"
    ? [
        "[env] DATABASE_URL is missing or still the placeholder.",
        "",
        "Fix: Set DATABASE_URL in cPanel -> Setup Node.js App -> Environment Variables",
        "Or create a .env file in the application root with:",
        '  DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/restaurantinternal"',
      ]
    : [
        "[env] DATABASE_URL is missing or still the placeholder.",
        "",
        "Fix: edit nice-server/.env and set DATABASE_URL to a real MySQL connection string, e.g.:",
        '  DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/restaurantinternal"',
        "",
        "Then rerun:",
        "  npm run prisma:migrate",
      ];
  console.error(errorMsg.join("\n"));
  process.exit(1);
}




