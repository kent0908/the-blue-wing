/**
 * Applies the pricing-redesign rate card to `model_rates`, OVERWRITING
 * whatever's there (unlike seed-rates.mjs, which only fills gaps). Run once
 * after this pricing pass; safe to re-run (idempotent upsert).
 *
 *   node scripts/apply-rate-card.mjs
 *
 * Every video/image rate here is derived from BytePlus's own published
 * per-model pricing (https://docs.byteplus.com/en/docs/modelark/1544106) at
 * a $0.01/credit retail peg, sized for ≥4x nominal margin so realized
 * margin holds ≥3x even through a subscription plan's own bulk discount
 * (see lib/plans.ts). Video rates are the 480p BASE — see
 * VIDEO_RESOLUTION_MULTIPLIER in lib/rateCard.ts for how 720p/1080p/4K scale
 * up from there. The Gemini and GPT Image models aren't from BytePlus, so
 * their costs below are conservative estimates, not verified current
 * pricing — flagged inline.
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
} catch {}
if (!process.env.POSTGRES_URL) {
  const f = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
  if (f) process.env.POSTGRES_URL = f;
}
if (!process.env.POSTGRES_URL) {
  console.error("✗ No POSTGRES_URL / DATABASE_URL found.");
  process.exit(1);
}

// ---- video: credits per second AT 480p — real BytePlus $/s, verified ----
const VIDEO_RATES = {
  "SIRAYA-Seedance-2.5": 42, // $0.1028/s -> 4.09x
  "NSFW-Seedance-2.5": 42,
  "SIRAYA-Seedance-2.0": 28, // $0.07/s -> 4.0x
  "NSFW-Seedance-2.0": 28,
  "SIRAYA-Seedance-2.0-fast": 24, // $0.06/s -> 4.0x
  "NSFW-Seedance-2.0-fast": 24,
  "SIRAYA-Seedance-2.0-mini": 15, // $0.036/s -> 4.17x
  "NSFW-Seedance-2.0-mini": 15,
  "ByteDance-Seedance-1.5-pro": 10, // $0.024/s (w/ audio) -> 4.17x
  "NSFW-Seedance-1.5-pro": 10,
  "ByteDance-Seedance-1.0-pro": 10, // $0.024/s -> 4.17x
  "NSFW-Seedance-1.0-pro": 10,
  "ByteDance-Seedance-1.0-pro-fast": 4, // $0.01/s -> 4.0x
  "NSFW-Seedance-1.0-pro-fast": 4,
  // not BytePlus / no reference pricing given — left at the existing
  // conservative estimate, unchanged by this pass
  "veo-3.1-generate-001": 70,
};

// ---- image: credits per image — real BytePlus $/image, verified ----
const IMAGE_RATES = {
  "ByteDance-Seedream-4.0": 12, // $0.03 -> 4.0x
  "NSFW-Seedream-4.0": 12,
  "ByteDance-Seedream-4.5": 16, // $0.04 -> 4.0x
  "NSFW-Seedream-4.5": 16,
  "Dola-Seedream-5.0-lite": 14, // $0.035 -> 4.0x
  "NSFW-Seedream-5.0-lite": 14,
  "Dola-Seedream-5.0-pro": 36, // worst case (>2.61MP) $0.09 -> 4.0x; best case $0.045 -> 8x
  "NSFW-Dola-Seedream-5.0-pro": 36,
  // NOT BytePlus — OpenAI/Google's own pricing, estimated conservatively
  // (not verified against a current, exact published rate the way the
  // Seedream numbers above are) — revisit if OpenAI/Google pricing changes
  "gpt-image-2": 60, // assumed up to ~$0.15/image at this app's default "high" quality
  "gemini-2.5-flash-image": 16, // assumed ~$0.04/image
  "gemini-3.1-flash-image": 32, // assumed ~$0.08/image
  "gemini-3.1-flash-lite-image": 10, // assumed ~$0.025/image
  "gemini-3-pro-image": 64, // assumed ~$0.16/image (priciest, reasoning-heavy tier)
};

const { sql } = await import("@vercel/postgres");

async function upsert(modelId, modality, credits) {
  await sql`
    insert into model_rates (model_id, modality, credits, active)
    values (${modelId}, ${modality}, ${credits}, true)
    on conflict (model_id) do update
      set modality = excluded.modality, credits = excluded.credits, active = true, updated_at = now()
  `;
}

let n = 0;
for (const [id, credits] of Object.entries(VIDEO_RATES)) {
  await upsert(id, "video", credits);
  n++;
}
for (const [id, credits] of Object.entries(IMAGE_RATES)) {
  await upsert(id, "image", credits);
  n++;
}
console.log(`✓ Applied ${n} model_rates rows.`);
process.exit(0);
