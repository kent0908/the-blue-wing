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

/** Retail resolution multipliers are pricing policy, not a provider cost guarantee. */
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
/** Active rate for a model, or null when there is no active row; callers must reject unavailable pricing. */
export async function getRate(modelId: string): Promise<ModelRate | null> {
  try {
    const { rows } = await sql<Row>`
      select model_id, modality, credits, active from model_rates
      where lower(model_id) = ${canonicalBillingModel(modelId).toLowerCase()} limit 1
    `;
    const r = rows[0];
    return r && r.active ? rowToRate(r) : null;
  } catch {
    // Table missing / DB down: no verified rate is available.
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
