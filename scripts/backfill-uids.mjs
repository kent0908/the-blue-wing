/** One-off: assign a public uid (lib/uid.ts format) to every user that has none. Safe to re-run. */
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
try { const env = readFileSync(join(here, "..", ".env.local"), "utf8"); for (const line of env.split("\n")) { const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {}
if (!process.env.POSTGRES_URL) process.env.POSTGRES_URL = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const { sql } = await import("@vercel/postgres");
const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const gen = () => `${letters[randomInt(letters.length)]}${letters[randomInt(letters.length)]}${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
const { rows } = await sql`select id from users where uid is null order by id`;
let done = 0;
for (const r of rows) {
  for (let i = 0; i < 5; i++) {
    try { await sql`update users set uid = ${gen()} where id = ${r.id} and uid is null`; done++; break; } catch { /* collision, retry */ }
  }
}
console.log(`backfilled ${done}/${rows.length} users`);
