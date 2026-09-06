import { creditTransaction, ledgerBalance } from "./creditTransactions";
import { SirayaApiError } from "./siraya";
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
  return creditTransaction(userId,c=>ledgerBalance(c,userId));
}
export async function addCredits(userId:number,delta:number,reason:string,ref?:string|null,expiresAt?:string|null):Promise<void> {
  if(!Number.isSafeInteger(delta)) throw new Error("Invalid credit delta");
  await creditTransaction(userId,async c=>{
    if(delta<0 && await ledgerBalance(c,userId)<-delta)throw new SirayaApiError(402,"點數不足");
    await c.query("INSERT INTO credit_ledger(user_id,delta,reason,ref,expires_at) VALUES($1,$2,$3,$4,$5)",[userId,delta,reason,ref??null,expiresAt??null]);
  });
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
import { getRate, creditCostFromRate } from "./rateCard";

export interface CostInput {
  kind: "image" | "video" | "text";
  model: string;
  imageCount?: number;
  seconds?: number;
  maxTokens?: number;
  /** video only — "480p" | "720p" | "1080p" | "4k"; see VIDEO_RESOLUTION_MULTIPLIER */
  resolution?: string;
}

/**
 * Credits a generation will cost. Reads the editable `model_rates` card —
 * deliberately does NOT fall back to a guessed price when a model has no
 * active row (or the row's modality doesn't match the request): a silently
 * wrong/legacy price for an un-seeded or misclassified model is a real
 * underpricing risk, not just a display inconvenience. If this starts
 * rejecting a model that should work, the fix is to add/correct its
 * model_rates row (see scripts/apply-rate-card.mjs), not to re-add a
 * fallback here.
 */
export async function creditCost(input: CostInput): Promise<number> {
  const rate = await getRate(input.model);
  if (rate && rate.modality === input.kind) {
    return creditCostFromRate({
      modality: rate.modality,
      credits: rate.credits,
      imageCount: input.imageCount,
      seconds: input.seconds,
      maxTokens: input.maxTokens,
      resolution: input.resolution,
    });
  }
  throw new SirayaApiError(400, "此模型尚未設定有效費率或已停用");
}

