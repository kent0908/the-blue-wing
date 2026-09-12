/** Seeds known vendor list prices into model_costs (only rows that don't exist yet). Safe to re-run. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
try { const env = readFileSync(join(here, "..", ".env.local"), "utf8"); for (const line of env.split("\n")) { const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {}
if (!process.env.POSTGRES_URL) process.env.POSTGRES_URL = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const { sql } = await import("@vercel/postgres");
// USD per image, from the catalogue's published list prices (lib/imageModels.ts). Video / text list prices are not
// published in the catalogue — fill those in /crm/costs.
const KNOWN = {
  "ByteDance-Seedream-4.0": 0.03, "NSFW-Seedream-4.0": 0.03,
  "ByteDance-Seedream-4.5": 0.04, "NSFW-Seedream-4.5": 0.04,
  "Dola-Seedream-5.0-lite": 0.035, "NSFW-Seedream-5.0-lite": 0.035,
  "Dola-Seedream-5.0-pro": 0.045, "NSFW-Dola-Seedream-5.0-pro": 0.045,
  "gpt-image-2": 0.04,
};
let n = 0;
for (const [model, price] of Object.entries(KNOWN)) {
  const r = await sql`insert into model_costs (model_id, list_price_usd, notes) values (${model}, ${price}, '目錄牌價（自動帶入）') on conflict (model_id) do nothing`;
  n += r.rowCount ?? 0;
}
console.log(`seeded ${n} model cost rows`);
