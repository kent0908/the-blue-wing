/**
 * Creates / updates the auth + credits tables from scripts/schema.sql.
 * Idempotent (CREATE ... IF NOT EXISTS) — safe to run repeatedly.
 *
 *   npm run db:migrate
 *
 * Needs POSTGRES_URL in the environment. For local runs:
 *   npx vercel link                     # once
 *   npx vercel env pull .env.local      # pulls POSTGRES_URL etc.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// minimal .env.local loader (no dotenv dependency)
try {
  const env = readFileSync(join(here, "..", ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local — use the ambient environment */
}

if (!process.env.POSTGRES_URL && !process.env.POSTGRES_PRISMA_URL) {
  console.error(
    "✗ POSTGRES_URL is not set.\n" +
      "  Attach a Vercel Postgres store to the project, then:\n" +
      "    npx vercel env pull .env.local"
  );
  process.exit(1);
}

const { sql } = await import("@vercel/postgres");
const schema = readFileSync(join(here, "schema.sql"), "utf8");

console.log("Running migration…");
await sql.query(schema);
console.log("✓ Schema is up to date.");
process.exit(0);
