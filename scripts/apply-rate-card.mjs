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

// ---- text: flat credits per message (lib/rateCard.ts adds a small token
// component on top: +1 per 2000 max_tokens) ----
// Real gap found 2026-09-07: model_rates had ZERO text rows at all, meaning
// every text feature (陪聊角色 companion chat, studio 多輪對話) was failing
// every single message with "此模型尚未設定有效費率或已停用" — lib/credits.ts's
// creditCost() deliberately has no fallback price for an unseeded model. Not
// BytePlus-published pricing (DeepSeek isn't a BytePlus model on this rate
// card) — conservative estimate off DeepSeek's known-cheap per-token pricing,
// not independently verified against a current published rate the way the
// Seedream/Seedance numbers above are.
const TEXT_RATES = {
  // 2026-09-16 文字創作 / 陪聊 picks (lib/audioModels.ts, lib/characters.ts) —
  // SIRAYA list prices verified via llm-ext-api.siraya.ai/api/v1/models.
  // Sized on a typical ~1.5K-in / 0.5K-out message at a $0.01/credit peg
  // with ≥4x margin (companion prompts are longer but DeepSeek is cheap).
  "deepseek-v4.1-flash": 1, // $0.15/$0.60 per MTok -> ~$0.0005/msg
  // Google slot: 3.5-flash replaced 3.8-flash on 2026-09-26 (see lib/audioModels.ts).
  // $1.50/$9.00 per MTok standard tier; a ~1.5K-in/60-out companion turn is
  // ~$0.0028, i.e. >10x margin at 3 credits charged. 3.8 keeps its row so an
  // in-flight request still prices correctly, but it is no longer offered.
  "gemini-3.5-flash": 2,
  "gemini-3.8-flash": 2, // $0.75/$3.75 -> ~$0.003/msg
  // 2026-10-09 replacements: public SIRAYA standard input/output per MTok.
  // Same 1.5K-in/0.5K-out planning assumption; actual bills remain separate.
  "gemini-3.1-pro-preview": 4, // $2/$12 -> $0.009/msg; +1 token credit = 5 total
  "gemini-3.5-flash-lite": 1, // $0.30/$2.50 -> $0.0017/msg; +1 = 2 total
  "gpt-5.4-mini": 2, // $0.75/$4.50 -> ~$0.0034/msg
  "claude-haiku-4.5": 2, // $1/$5 -> ~$0.004/msg
  "deepseek-v4-flash": 1,
  "deepseek-v4-flash-0731": 1,
  "deepseek-v4-pro": 2,
  "deepseek-v4-pro-0813": 2,
  // 2026-09-29 陪聊五階 (lib/companionModels.ts). SIRAYA's price catalogue came
  // back from its HTTP 500 that day, so these three are derived from its own
  // published rates, measured at the real prompt depth the chat now sends
  // (130 messages of history — see lib/chatHistoryBudget.ts), 3 runs each:
  //   NSFW-Seed-SC     $0.40/$1.60  4004-in/75-out  -> $0.00172  ->  2 credits, 12x
  //   claude-sonnet-5  $2/$10       4885-in/131-out -> $0.01108  ->  5 credits, 4.5x
  //   claude-fable-5.1 $10/$50      4887-in/185-out -> $0.05812  -> 24 credits, 4.1x
  // NSFW-/uncensored- aliases bill at their base model's rate (owner confirmed;
  // the video card above has paired SIRAYA-/NSFW-Seedance identically since it
  // was written), so NSFW-Seed-SC takes ByteDance-Seed-SC's price. Both rows
  // are seeded: the filtered twin is not on the menu but must still price if a
  // character row points at it.
  "NSFW-Seed-SC": 1,
  "ByteDance-Seed-SC": 1,
  "ByteDance-Seed-1.8": 1, // $0.25/$2.00 -> $0.00112 -> 2 credits, 18x
  "claude-sonnet-5": 4,
  "claude-fable-5.1": 23,
};

// ---- speech (TTS): credits per SPEECH_CHARS_PER_UNIT (40) characters of
// spoken text — see lib/creditFormula.ts. Google's published Gemini TTS
// pricing (2026-09-26, ai.google.dev/gemini-api/docs/pricing): audio output
// is billed at 25 tokens per second of audio, $9/M tokens for 3.8 Flash TTS
// through 2026-12-31 (it DOUBLES on 2027-01-01 — revisit this rate then).
// Mandarin TTS runs ~4.5 chars/second, so 40 characters ≈ 9s ≈ 225 audio
// tokens ≈ $0.0020, plus a negligible text-input charge. At the $0.01/credit
// peg that is ~5x margin, matching the >=4x floor used above. The site's own
// 74 stored replies average 104 characters, i.e. ~3 credits to read aloud.
const SPEECH_RATES = {
  "gemini-3.8-flash-tts": 1,
  "gemini-3.8-flash-lite-tts": 1, // cheaper alternative ($6/M) if quality allows
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
  "gpt-image-2.5-sunburst": 60, // same OpenAI per-image tier as gpt-image-2 (site default image model)
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
for (const [id, credits] of Object.entries(TEXT_RATES)) {
  await upsert(id, "text", credits);
  n++;
}
for (const [id, credits] of Object.entries(SPEECH_RATES)) {
  await upsert(id, "speech", credits);
  n++;
}
console.log(`✓ Applied ${n} model_rates rows.`);
process.exit(0);
