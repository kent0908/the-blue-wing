import "server-only";
import { sql, type UserRow } from "./db";
import { isAdultVerified } from "./adultGate";
import { BusinessError, type BusinessAccount } from "./businessTypes";
import { consoleConfig, decimalMicros, fetchUsageRequest, microsDecimal, validRequestId, type BillingRecord } from "./sirayaConsole";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface BillingJob {
  id: string; account_id: string; user_id: number | string; model: string; nsfw: boolean; status: string;
  provider_request_id: string | null; provider_request_ids: string[] | null;
  provider_receipt_count: number;
  submitted_at: string | Date | null; created_at: string | Date;
  provider_cost: string | null; provider_currency: string | null; billing_status: string;
  billing_checked_at: string | Date | null; provider_billing_outcome: string | null; provider_duration_ms: string | number | null;
}
const FIELDS = `id,account_id,user_id,model,nsfw,status,provider_request_id,provider_request_ids,provider_receipt_count,submitted_at,created_at,
  provider_cost,provider_currency,billing_status,billing_checked_at,provider_billing_outcome,provider_duration_ms`;
const iso = (value: string | Date | null) => value ? new Date(value).toISOString() : null;
export function publicBusinessBilling(row: BillingJob) {
  return { id: row.id, providerRequestId: row.provider_request_id,
    providerCost: row.provider_cost, providerCurrency: row.provider_currency, billingStatus: row.billing_status,
    billingCheckedAt: iso(row.billing_checked_at), providerBillingOutcome: row.provider_billing_outcome,
    providerDurationMs: row.provider_duration_ms === null ? null : Number(row.provider_duration_ms) };
}
async function ownedJob(user: UserRow, account: BusinessAccount, id: string): Promise<BillingJob> {
  if (!UUID.test(id)) throw new BusinessError("generation_not_found", 404);
  const { rows } = await sql.query<BillingJob>(`select ${FIELDS} from business_generations where id=$1 and account_id=$2 and user_id=$3`, [id, account.id, user.id]);
  const row = rows[0];
  if (!row || row.account_id !== account.id || Number(row.user_id) !== user.id) throw new BusinessError("generation_not_found", 404);
  if (row.nsfw && !isAdultVerified(user)) throw new BusinessError("age_unverified", 403);
  return row;
}
const normalizedModel = (model: string) => model.toLowerCase().replace(/^nsfw-/, "");
function matchesReceipt(row: BillingJob, receipt: BillingRecord): boolean {
  const submitted = new Date(row.submitted_at ?? row.created_at).getTime();
  const timestamp = Date.parse(receipt.timestamp);
  return normalizedModel(receipt.model) === normalizedModel(row.model) && Number.isFinite(submitted) &&
    timestamp >= submitted - 300_000 && timestamp <= Date.now() + 300_000;
}

/** Only server-captured receipts from an owned job are eligible. Never accept caller-supplied provider IDs or expose Root totals. */
export async function syncBusinessGenerationBilling(user: UserRow, account: BusinessAccount, id: string) {
  const row = await ownedJob(user, account, id);
  const ids = [...new Set(row.provider_request_ids?.length ? row.provider_request_ids : row.provider_request_id ? [row.provider_request_id] : [])];
  let receipts: BillingRecord[] = [];
  let matched = false;
  let pendingReceipt = false;
  if (ids.length > 0 && ids.length <= 3 && ids.length === row.provider_receipt_count && ids.every(validRequestId) && consoleConfig().configured) {
    // A short per-job claim bounds repeated/concurrent refreshes without holding a DB transaction across external I/O.
    const claim = await sql.query(`update business_generations set billing_checked_at=now()
      where id=$1 and account_id=$2 and user_id=$3 and provider_request_id is not distinct from $4
        and provider_receipt_count=$5 and coalesce(provider_request_ids,'{}'::text[])=$6::text[]
        and (billing_checked_at is null or billing_checked_at<now()-interval '10 seconds') returning id`,
    [id, account.id, user.id, row.provider_request_id, row.provider_receipt_count, row.provider_request_ids ?? []]);
    if (!claim.rows.length) return publicBusinessBilling(await ownedJob(user, account, id));
    try {
      // The existing helper validates the exact request ID and its configured account subtree. No generation call occurs here.
      const signal = AbortSignal.timeout(45_000);
      for (const requestId of ids) {
        const receipt = await fetchUsageRequest(requestId, signal);
        if (receipt.requestId !== requestId || !matchesReceipt(row, receipt)) throw new Error("receipt mismatch");
        receipts.push(receipt);
      }
      const complete = receipts.length === ids.length && new Set(receipts.map(receipt => receipt.currency)).size === 1;
      const terminalJob = ["completed", "failed"].includes(row.status);
      const settledReceipts = receipts.every(receipt => ["success", "failed", "error", "cancelled", "canceled"].includes(receipt.status.toLowerCase()));
      matched = complete && terminalJob && settledReceipts;
      pendingReceipt = complete && (!terminalJob || !settledReceipts);
    } catch { pendingReceipt = receipts.length > 0; receipts = []; }
  }
  if (matched) {
    const cost = microsDecimal(receipts.reduce((sum, receipt) => sum + decimalMicros(receipt.cost), BigInt(0)));
    const outcome = new Set(receipts.map(receipt => receipt.status)).size === 1 ? receipts[0].status : "mixed";
    const latencies = receipts.map(receipt => receipt.performance.latency_ms);
    const providerDuration = latencies.every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      ? latencies.reduce((sum, value) => sum + value, 0) : null;
    await sql.query(`update business_generations set provider_cost=$4::numeric,provider_currency=$5,billing_status='matched',
      billing_checked_at=now(),provider_billing_outcome=$6,provider_duration_ms=$7
      where id=$1 and account_id=$2 and user_id=$3 and provider_request_id is not distinct from $8
        and coalesce(provider_request_ids,'{}'::text[])=$9::text[] and provider_receipt_count=$10`,
    [id, account.id, user.id, cost, receipts[0].currency, outcome, providerDuration, row.provider_request_id, row.provider_request_ids ?? [], row.provider_receipt_count]);
  } else {
    const pending = pendingReceipt || !ids.length && ["submitting", "processing"].includes(row.status);
    // A missing/inaccessible receipt never turns into zero spend and never erases an already verified invoice value.
    await sql.query(`update business_generations set billing_status=$4,billing_checked_at=now()
      where id=$1 and account_id=$2 and user_id=$3 and billing_status<>'matched'
        and provider_request_id is not distinct from $5 and coalesce(provider_request_ids,'{}'::text[])=$6::text[]`,
    [id, account.id, user.id, pending ? "pending" : "unavailable", row.provider_request_id, row.provider_request_ids ?? []]);
  }
  return publicBusinessBilling(await ownedJob(user, account, id));
}
