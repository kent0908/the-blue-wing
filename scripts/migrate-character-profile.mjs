// Apply only this additive migration, without running unrelated schema changes.
import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";
nextEnv.loadEnvConfig(process.cwd());
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
let pool;
try {
  if (!connectionString) throw new Error("missing connection");
  const host = new URL(connectionString).hostname;
  if (!/^ep-wandering-tree-azh11bhm(-pooler)?\.c-3\.ap-southeast-1\.aws\.neon\.tech$/.test(host)) throw new Error("unexpected target");
  pool = createPool({ connectionString });
  await pool.query(readFileSync(new URL("./character-profile.sql", import.meta.url), "utf8"));
  const result = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='characters' AND column_name='profile'");
  if (result.rows[0]?.data_type !== "jsonb") throw new Error("verification failed");
  console.log("Character profile migration verified; existing records unchanged.");
} catch {
  console.error("Character profile migration failed. Check the configured database privately; no credentials were logged.");
  process.exitCode = 1;
} finally { if (pool) await pool.end(); }
