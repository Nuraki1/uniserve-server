/**
 * Load `.env` before any module reads `process.env` (e.g. `./env`).
 * ES module `import` is hoisted, so dotenv cannot run after imports in `index.ts`;
 * this side-effect module must be the first import in the entry file.
 */
import path from "path";
import dotenv from "dotenv";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "..", ".env"),
];

for (const envPath of candidates) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) break;
}
