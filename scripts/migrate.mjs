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

// @vercel/postgres wants POSTGRES_URL; Neon's Vercel integration ships DATABASE_URL.
if (!process.env.POSTGRES_URL) {
  const fallback = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
  if (fallback) process.env.POSTGRES_URL = fallback;
}

if (!process.env.POSTGRES_URL) {
  console.error(
    "✗ No database connection string found (POSTGRES_URL / DATABASE_URL).\n" +
      "  In the Vercel dashboard: Storage → your Neon store → Connect to Project,\n" +
      "  then:  npx vercel env pull .env.local"
  );
  process.exit(1);
}

const { sql } = await import("@vercel/postgres");
const schema = readFileSync(join(here, "schema.sql"), "utf8");

console.log("Running migration…");
await sql.query(schema);
console.log("✓ Schema is up to date.");
process.exit(0);
