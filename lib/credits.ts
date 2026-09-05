/**
 * Credit balance = SUM(credit_ledger.delta) for the user, EXCLUDING rows
 * whose expires_at has passed. Every grant and every spend is one
 * append-only row, so the balance is always auditable; expiry is just a
 * filter on the same query, not a separate reset job — a monthly plan
 * grant's `expires_at` (next renewal date) or a credit pack's (2 years out)
 * simply stops counting once that date passes. NULL expires_at (spends,
 * refunds, admin goodwill grants) never expires.
 */
import { sql } from "./db";
import { getPlan } from "./plans";

export async function getBalance(userId: number): Promise<number> {
  await ensureDailyFreeCredits(userId);
  const { rows } = await sql<{ bal: number }>`
    select coalesce(sum(delta), 0)::int as bal from credit_ledger
    where user_id = ${userId} and (expires_at is null or expires_at > now())
  `;
  return rows[0]?.bal ?? 0;
}

export async function addCredits(
  userId: number,
  delta: number,
  reason: string,
  ref?: string | null,
  expiresAt?: string | null
): Promise<void> {
  await sql`
    insert into credit_ledger (user_id, delta, reason, ref, expires_at)
    values (${userId}, ${Math.trunc(delta)}, ${reason}, ${ref ?? null}, ${expiresAt ?? null})
  `;
}

/**
 * Free-tier users get a small daily allowance instead of a monthly one —
 * granted the moment they sign up, then topped back up once per calendar
 * day, expiring at the end of that same day so it never carries over (a
 * patient free user can't bank it up over time). Dedupes on
 * (user_id, ref='<today's date>') via a partial unique index scoped to
 * reason='daily_free', so a race between concurrent requests is harmless.
 * A no-op for anyone not currently on the free plan.
 */
async function ensureDailyFreeCredits(userId: number): Promise<void> {
  const { rows } = await sql<{ plan_code: string }>`select plan_code from users where id = ${userId} limit 1`;
  if (rows[0]?.plan_code !== "free") return;

  const daily = getPlan("free").dailyCredits;
  if (!daily) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD, this user's grant key for today
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  await sql`
    insert into credit_ledger (user_id, delta, reason, ref, expires_at)
    values (${userId}, ${daily}, 'daily_free', ${today}, ${endOfDay.toISOString()})
    on conflict (user_id, ref) where reason = 'daily_free' do nothing
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
import { getRate, creditCostFromRate, resolutionMultiplier } from "./rateCard";

export interface CostInput {
  kind: "image" | "video" | "text";
  model: string;
  imageCount?: number;
  seconds?: number;
  maxTokens?: number;
  /** video only — "480p" | "720p" | "1080p" | "4k"; see VIDEO_RESOLUTION_MULTIPLIER */
  resolution?: string;
}

/** Hard-coded fallback used only when a model has no active `model_rates` row.
 *  Base rates are 480p — resolutionMultiplier() scales up from there, same
 *  as the rate-card path, so an un-seeded model still holds its margin at
 *  every resolution instead of just the default one. */
function legacyCost(input: CostInput): number {
  const id = input.model.toLowerCase();
  if (input.kind === "image") {
    const per = /gpt-image|gemini-3-pro-image|seedream-4\.5|seedream-5/.test(id) ? 14 : 10;
    return per * Math.max(1, input.imageCount ?? 1);
  }
  if (input.kind === "video") {
    const secs = Math.max(1, Math.ceil(input.seconds ?? 5));
    const base = /veo|sora/.test(id) ? 70 : 45;
    const perSecondAtRes = Math.ceil(base * resolutionMultiplier(input.resolution));
    return secs * perSecondAtRes;
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
      resolution: input.resolution,
    });
  }
  return legacyCost(input);
}
