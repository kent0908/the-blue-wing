/**
 * Per-model credit rate card — the single source of truth for what a
 * generation costs. Rows live in `model_rates` (seeded by scripts/seed-rates.mjs,
 * edited from /admin). `credits` means:
 *   image  → credits per generated image
 *   video  → credits per second of video
 *   text   → flat credits per message (a token component is added on top)
 *
 * Server-only: every export here touches the DB or is called from route handlers.
 */
import { sql } from "./db";

export type Modality = "image" | "video" | "text";

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
export function creditCostFromRate(input: {
  modality: Modality;
  credits: number;
  imageCount?: number;
  seconds?: number;
  maxTokens?: number;
}): number {
  const per = Math.max(0, Math.trunc(input.credits));
  if (input.modality === "image") return Math.max(1, per * Math.max(1, Math.trunc(input.imageCount ?? 1)));
  if (input.modality === "video") return Math.max(1, per * Math.max(1, Math.ceil(input.seconds ?? 5)));
  // text: flat per-message credits + a token component
  return Math.max(1, per + Math.ceil((input.maxTokens ?? 1024) / 2000));
}

/** Active rate for a model, or null when there's no (active) row — caller falls back. */
export async function getRate(modelId: string): Promise<ModelRate | null> {
  try {
    const { rows } = await sql<Row>`
      select model_id, modality, credits, active from model_rates
      where model_id = ${modelId} limit 1
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
