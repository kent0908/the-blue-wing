import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = val;
}
if (!process.env.POSTGRES_URL) { const f = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL; if (f) process.env.POSTGRES_URL = f; }
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_UNPOOLED) process.env.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL_UNPOOLED;
const { sql } = await import("@vercel/postgres");
const { rows } = await sql`select * from landing_media`;
console.log(rows);
