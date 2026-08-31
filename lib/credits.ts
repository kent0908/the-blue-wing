/**
 * Credit balance = SUM(credit_ledger.delta) for the user. Every grant and
 * every spend is one append-only row, so the balance is always auditable.
 */
import { sql } from "./db";

export async function getBalance(userId: number): Promise<number> {
  const { rows } = await sql<{ bal: number }>`
    select coalesce(sum(delta), 0)::int as bal from credit_ledger where user_id = ${userId}
  `;
  return rows[0]?.bal ?? 0;
}

export async function addCredits(
  userId: number,
  delta: number,
  reason: string,
  ref?: string | null
): Promise<void> {
  await sql`
    insert into credit_ledger (user_id, delta, reason, ref)
    values (${userId}, ${Math.trunc(delta)}, ${reason}, ${ref ?? null})
  `;
}

export interface LedgerRow {
  id: number;
  delta: number;
  reason: string;
  ref: string | null;
  created_at: string;
}

export async function recentLedger(userId: number, limit = 50): Promise<LedgerRow[]> {
  const { rows } = await sql<LedgerRow>`
    select id, delta, reason, ref, created_at
    from credit_ledger
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `;
  return rows;
}

/* ---- what a generation costs, in credits ---- */
import { getRate, creditCostFromRate } from "./rateCard";

export interface CostInput {
  kind: "image" | "video" | "text";
  model: string;
  imageCount?: number;
  seconds?: number;
  maxTokens?: number;
}

/** Hard-coded fallback used only when a model has no active `model_rates` row. */
function legacyCost(input: CostInput): number {
  const id = input.model.toLowerCase();
  if (input.kind === "image") {
    const per = /gpt-image|gemini-3-pro-image|seedream-4\.5|seedream-5/.test(id) ? 14 : 10;
    return per * Math.max(1, input.imageCount ?? 1);
  }
  if (input.kind === "video") {
    const secs = Math.max(1, Math.ceil(input.seconds ?? 5));
    const perSec = /veo|sora/.test(id) ? 70 : 50;
    return secs * perSec;
  }
  return 2 + Math.ceil((input.maxTokens ?? 1024) / 2000);
}

/**
 * Credits a generation will cost. Reads the editable `model_rates` card first;
 * falls back to legacyCost() when the model isn't in the table.
 */
export async function creditCost(input: CostInput): Promise<number> {
  const rate = await getRate(input.model);
  if (rate) {
    return creditCostFromRate({
      modality: rate.modality,
      credits: rate.credits,
      imageCount: input.imageCount,
      seconds: input.seconds,
      maxTokens: input.maxTokens,
    });
  }
  return legacyCost(input);
}
