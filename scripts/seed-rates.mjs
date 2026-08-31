/**
 * Seeds `model_rates` with default per-model credit values for the current
 * SIRAYA image/video model lineup. Idempotent — `on conflict do nothing`, so
 * re-running never overwrites values you've since edited in /admin.
 *
 *   node scripts/seed-rates.mjs
 *
 * Needs POSTGRES_URL (or DATABASE_URL) and SIRAYA_API_KEY — pulled from
 * .env.local the same way scripts/migrate.mjs does.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(join(here, "..", ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local — use ambient env */
}
if (!process.env.POSTGRES_URL) {
  const f = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
  if (f) process.env.POSTGRES_URL = f;
}
if (!process.env.POSTGRES_URL) {
  console.error("✗ No POSTGRES_URL / DATABASE_URL found.");
  process.exit(1);
}
if (!process.env.SIRAYA_API_KEY) {
  console.error("✗ No SIRAYA_API_KEY found.");
  process.exit(1);
}

const BASE = process.env.SIRAYA_BASE_URL || "https://llm.siraya.ai/v1";

function classify(id) {
  const s = id.toLowerCase();
  const isVideo = /veo|sora|seedance|kling|hailuo|wan|happyhorse|video/.test(s);
  const isImage = /image|imagen|seedream|nano-banana|flux|dall|dola-seed/.test(s);
  if (isVideo) {
    if (s.includes("veo")) return { modality: "video", credits: 70 };
    if (s.includes("seedance-2.5")) return { modality: "video", credits: 55 };
    if (s.includes("-2.0-mini")) return { modality: "video", credits: 30 };
    if (s.includes("-2.0-fast")) return { modality: "video", credits: 40 };
    if (s.includes("seedance-2.0")) return { modality: "video", credits: 45 };
    if (s.includes("-1.0-pro") || s.includes("-1.5-pro")) return { modality: "video", credits: 40 };
    return { modality: "video", credits: 45 };
  }
  if (isImage) {
    if (/gpt-image-2|gemini-3-pro-image|seedream-4\.5|dola-seedream-5\.0/.test(s)) return { modality: "image", credits: 14 };
    if (/flash-lite-image|gemini-2\.5-flash-image/.test(s)) return { modality: "image", credits: 8 };
    return { modality: "image", credits: 10 };
  }
  return null; // text → left to the fallback formula
}

const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${process.env.SIRAYA_API_KEY}` } });
if (!res.ok) {
  console.error("✗ SIRAYA /models failed:", res.status, (await res.text()).slice(0, 200));
  process.exit(1);
}
const models = (await res.json())?.data ?? [];
const seeds = models
  .map((m) => ({ id: String(m.id), ...(classify(String(m.id)) || {}) }))
  .filter((m) => m.modality);

const { sql } = await import("@vercel/postgres");
let inserted = 0;
for (const s of seeds) {
  const r = await sql`
    insert into model_rates (model_id, modality, credits)
    values (${s.id}, ${s.modality}, ${s.credits})
    on conflict (model_id) do nothing
  `;
  inserted += r.rowCount ?? 0;
}
console.log(`✓ Seeded ${inserted} new model_rates rows (${seeds.length} candidates, existing left untouched).`);
process.exit(0);
