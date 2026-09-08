/**
 * Per-model credit rate card — the single source of truth for what a
 * generation costs. Rows live in `model_rates` (seeded by scripts/seed-rates.mjs,
 * edited from /admin). `credits` means:
 *   image  → credits per generated image
 *   video  → credits per second of video AT 480p (see VIDEO_RESOLUTION_MULTIPLIER)
 *   text   → flat credits per message (a token component is added on top)
 *
 * Server-only: every export here touches the DB or is called from route handlers.
 */
import { sql } from "./db";
import { canonicalBillingModel } from "./billingModel";
export { creditCostFromRate, resolutionMultiplier, VIDEO_RESOLUTION_MULTIPLIER } from "./creditFormula";

export type Modality = "image" | "video" | "text";

/**
 * Real BytePlus per-second cost does NOT scale linearly with resolution — it
 * roughly doubles+ at each step (verified against BytePlus's own published
 * per-model pricing tables for the Seedance family, both the 2.0 and 2.5
 * lines land on close to the same ratios: 480p→720p→1080p→4K costs scale by
 * roughly ×1, ×2.25, ×5.5, ×11). A single flat credits-per-second rate can't
 * hold the same margin at every resolution — at 1080p specifically, a rate
 * sized for 480p would charge LESS than BytePlus actually bills for it. This
 * multiplier is applied on top of the model's base (480p) rate so the
 * margin built into that base rate holds at every resolution, not just the
 * default one.
 */
export interface ModelRate {
  modelId: string;
  modality: Modality;
  credits: number;
  active: boolean;
}

interface Row {
  model_id: string;
  modality: Modality;
  credits: number;
  active: boolean;
}

const rowToRate = (r: Row): ModelRate => ({
  modelId: r.model_id,
  modality: r.modality,
  credits: r.credits,
  active: r.active,
});

/** Final charge for one generation, given its per-unit rate and the request shape. */
/** Active rate for a model, or null when there's no (active) row — caller falls back. */
export async function getRate(modelId: string): Promise<ModelRate | null> {
  try {
    const { rows } = await sql<Row>`
      select model_id, modality, credits, active from model_rates
      where lower(model_id) = ${canonicalBillingModel(modelId).toLowerCase()} limit 1
    `;
    const r = rows[0];
    return r && r.active ? rowToRate(r) : null;
  } catch {
    // table missing / DB down — let the caller use its legacy formula
    return null;
  }
}

export async function listRates(): Promise<ModelRate[]> {
  const { rows } = await sql<Row>`
    select model_id, modality, credits, active from model_rates order by modality, model_id
  `;
  return rows.map(rowToRate);
}

export async function upsertRate(
  modelId: string,
  modality: Modality,
  credits: number,
  active: boolean
): Promise<void> {
  await sql`
    insert into model_rates (model_id, modality, credits, active)
    values (${modelId}, ${modality}, ${Math.max(0, Math.trunc(credits))}, ${active})
    on conflict (model_id) do update
      set modality = excluded.modality,
          credits = excluded.credits,
          active = excluded.active,
          updated_at = now()
  `;
}
