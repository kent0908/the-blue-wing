import "server-only";
import { sql, type UserRow } from "./db";
import { isAdultVerified } from "./adultGate";
import { BusinessError, type BusinessAccount } from "./businessTypes";
import { BillingError, consoleConfig, decimalMicros, fetchUsageRequest, microsDecimal, validRequestId, type BillingRecord } from "./sirayaConsole";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_RECEIPTS = 20;
const PAGE_CONCURRENCY = 3;
const terminalJob = (status: string) => status === "completed" || status === "failed";
const terminalReceipt = (status: string) => ["success", "failed", "error", "cancelled", "canceled"].includes(status.toLowerCase());

export interface BillingJob {
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
const requestIds = (row: BillingJob) => [...new Set(row.provider_request_ids?.length ? row.provider_request_ids : row.provider_request_id ? [row.provider_request_id] : [])];
export const validBusinessGenerationId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export function businessBillingEligibility(row: BillingJob) {
  if (row.billing_status === "matched") return "already_matched";
  if (!terminalJob(row.status)) return "generation_pending";
  const ids = requestIds(row);
  if (!ids.length) return "missing_request";
  if (ids.length > 3 || ids.length !== row.provider_receipt_count || !ids.every(validRequestId)) return "incomplete_request";
  return "ready";
}

export function publicBusinessBilling(row: BillingJob) {
  return { id: row.id, providerRequestId: row.provider_request_id,
    providerCost: row.provider_cost, providerCurrency: row.provider_currency, billingStatus: row.billing_status,
    billingCheckedAt: iso(row.billing_checked_at), providerBillingOutcome: row.provider_billing_outcome,
    providerDurationMs: row.provider_duration_ms === null ? null : Number(row.provider_duration_ms) };
}

function assertOwnedJob(user: UserRow, account: BusinessAccount, row: BillingJob | undefined): asserts row is BillingJob {
  // PostgreSQL bigint identifiers are canonical decimal strings at runtime, including getSessionUser's user.id.
  // Compare canonical strings on both sides; Number() would also lose precision for future large IDs.
  const owner = String(user.id);
  if (!row || row.account_id !== account.id || !/^[1-9]\d*$/.test(owner) || String(row.user_id) !== owner) throw new BusinessError("generation_not_found", 404);
  if (row.nsfw && !isAdultVerified(user)) throw new BusinessError("age_unverified", 403);
}
async function ownedJob(user: UserRow, account: BusinessAccount, id: string): Promise<BillingJob> {
  if (!validBusinessGenerationId(id)) throw new BusinessError("generation_not_found", 404);
  const { rows: [row] } = await sql.query<BillingJob>(`select ${FIELDS} from business_generations where id=$1 and account_id=$2 and user_id=$3`, [id, account.id, user.id]);
  assertOwnedJob(user, account, row);
  return row;
}

const normalizedModel = (model: string) => model.toLowerCase().replace(/^nsfw-/, "");
function matchesReceipt(row: BillingJob, receipt: BillingRecord): boolean {
  const submitted = new Date(row.submitted_at ?? row.created_at).getTime();
  const timestamp = Date.parse(receipt.timestamp);
  return normalizedModel(receipt.model) === normalizedModel(row.model) && Number.isFinite(submitted) &&
    timestamp >= submitted - 300_000 && timestamp <= Date.now() + 300_000;
}

type BillingEligibility = ReturnType<typeof businessBillingEligibility>;
type BillingReason = Exclude<BillingEligibility, "ready"> | "not_configured" | "recently_checked" | "not_found" | "outside_scope" |
  "provider_auth" | "provider_pending" | "receipt_mismatch" | "mixed_currency" | "temporary" | "deferred" | "rate_limited";
type BillingOutcome = "matched" | "pending" | "unavailable" | "skipped" | "error";
type BillingResult = ReturnType<typeof publicBusinessBilling> & { outcome: BillingOutcome; reason?: BillingReason; retryAfter?: number };
const resultFor = (row: BillingJob, outcome: BillingOutcome, reason?: BillingReason, retryAfter?: number): BillingResult =>
  ({ ...publicBusinessBilling(row), outcome, reason, retryAfter });

function classifyLookup(error: unknown): { outcome: BillingOutcome; reason: BillingReason; retryAfter?: number } {
  if (error instanceof BillingError) {
    if (error.code === "console_http_404") return { outcome: "pending", reason: "not_found" };
    if (error.code === "request_outside_scope") return { outcome: "unavailable", reason: "outside_scope" };
    if (["console_http_401", "console_http_403"].includes(error.code)) return { outcome: "unavailable", reason: "provider_auth" };
    if (error.code === "request_id_mismatch") return { outcome: "unavailable", reason: "receipt_mismatch" };
    if (error.status === 429) return { outcome: "error", reason: "rate_limited", retryAfter: error.retryAfter ?? undefined };
  }
  return { outcome: "error", reason: "temporary" };
}

async function syncBillingRow(user: UserRow, account: BusinessAccount, row: BillingJob, configured: boolean, signal: AbortSignal): Promise<BillingResult> {
  assertOwnedJob(user, account, row);
  const eligibility = businessBillingEligibility(row);
  if (eligibility !== "ready") return resultFor(row, "skipped", eligibility);
  if (!configured) return resultFor(row, "unavailable", "not_configured");
  if (signal.aborted) return resultFor(row, "skipped", "deferred");
  const scope = [row.id, account.id, user.id, row.provider_request_id, row.provider_receipt_count, row.provider_request_ids ?? [], row.status];
  const where = `id=$1 and account_id=$2 and user_id=$3 and provider_request_id is not distinct from $4
    and provider_receipt_count=$5 and coalesce(provider_request_ids,'{}'::text[])=$6::text[] and status=$7`;
  // Keep the claim longer than the lookup deadline so overlapping refreshes cannot repeat the same lookup.
  const claim = await sql.query<{ billing_checked_at: string }>(`update business_generations set billing_checked_at=now()
    where ${where} and billing_status<>'matched'
      and (billing_checked_at is null or billing_checked_at<now()-interval '60 seconds') returning billing_checked_at::text as billing_checked_at`, scope);
  const checkedAt = claim.rows[0]?.billing_checked_at;
  if (!checkedAt) {
    const current = await ownedJob(user, account, row.id);
    const latest = businessBillingEligibility(current);
    return resultFor(current, "skipped", latest === "ready" ? "recently_checked" : latest);
  }
  row = { ...row, billing_checked_at: checkedAt };
  // Compare the claimed version when saving. Never overwrite an invoice if the attempts or local outcome changed.
  const claimedWhere = `${where} and billing_status<>'matched' and billing_checked_at=$8::timestamptz`;
  const claimedScope = [...scope, checkedAt];
  const receipts: BillingRecord[] = [];
  let problem: ReturnType<typeof classifyLookup> | undefined;
  try {
    // Each exact lookup also verifies membership in the configured account subtree.
    for (const requestId of requestIds(row)) {
      signal.throwIfAborted();
      const receipt = await fetchUsageRequest(requestId, signal);
      if (receipt.requestId !== requestId || !matchesReceipt(row, receipt)) throw new BillingError("request_id_mismatch");
      receipts.push(receipt);
    }
    if (new Set(receipts.map(receipt => receipt.currency)).size !== 1) problem = { outcome: "unavailable", reason: "mixed_currency" };
    else if (!receipts.every(receipt => terminalReceipt(receipt.status))) problem = { outcome: "pending", reason: "provider_pending" };
  } catch (error) {
    problem = classifyLookup(error);
  }
  if (!problem) {
    const cost = microsDecimal(receipts.reduce((sum, receipt) => sum + decimalMicros(receipt.cost), BigInt(0)));
    const outcome = new Set(receipts.map(receipt => receipt.status)).size === 1 ? receipts[0].status : "mixed";
    const latencies = receipts.map(receipt => receipt.performance.latency_ms);
    const providerDuration = latencies.every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      ? latencies.reduce((sum, value) => sum + value, 0) : null;
    const { rows: [updated] } = await sql.query<BillingJob>(`update business_generations
      set provider_cost=$9::numeric,provider_currency=$10,billing_status='matched',provider_billing_outcome=$11,provider_duration_ms=$12
      where ${claimedWhere} returning ${FIELDS}`, [...claimedScope, cost, receipts[0].currency, outcome, providerDuration]);
    if (updated) return resultFor(updated, "matched");
    return resultFor(await ownedJob(user, account, row.id), "skipped", "deferred");
  }
  if (problem.outcome === "error") return resultFor(row, problem.outcome, problem.reason, problem.retryAfter);
  // Absence, authorization issues and mismatches leave the amount unset.
  const { rows: [updated] } = await sql.query<BillingJob>(`update business_generations set billing_status=$9
    where ${claimedWhere} returning ${FIELDS}`, [...claimedScope, problem.outcome]);
  if (updated) return resultFor(updated, problem.outcome, problem.reason);
  return resultFor(await ownedJob(user, account, row.id), "skipped", "deferred");
}

/** Only server-captured receipts from an owned job are eligible. No generation or consumer credit operations. */
export async function syncBusinessGenerationBilling(user: UserRow, account: BusinessAccount, id: string, requestSignal?: AbortSignal) {
  const timeout = AbortSignal.timeout(45_000);
  return syncBillingRow(user, account, await ownedJob(user, account, id), consoleConfig().configured,
    requestSignal ? AbortSignal.any([timeout, requestSignal]) : timeout);
}

export async function reconcileBusinessBillingPage(user: UserRow, account: BusinessAccount, rows: BillingJob[], requestSignal?: AbortSignal) {
  const configured = consoleConfig().configured;
  const timeout = AbortSignal.timeout(30_000);
  const signal = requestSignal ? AbortSignal.any([timeout, requestSignal]) : timeout;
  const results = new Map<string, BillingResult>();
  const ready: BillingJob[] = [];
  for (const row of rows) {
    assertOwnedJob(user, account, row);
    const eligibility = businessBillingEligibility(row);
    if (eligibility !== "ready") results.set(row.id, resultFor(row, "skipped", eligibility));
    else if (!configured) results.set(row.id, resultFor(row, "unavailable", "not_configured"));
    else ready.push(row);
  }
  // Give untouched and least recently checked jobs priority on repeat runs.
  ready.sort((left, right) => (left.billing_checked_at ? new Date(left.billing_checked_at).getTime() : 0) -
    (right.billing_checked_at ? new Date(right.billing_checked_at).getTime() : 0));
  let cursor = 0;
  let remaining = MAX_PAGE_RECEIPTS;
  let stop = false;
  const worker = async () => {
    while (!stop && !signal.aborted && cursor < ready.length) {
      const row = ready[cursor++];
      const count = requestIds(row).length;
      if (count > remaining) continue;
      remaining -= count;
      const result = await syncBillingRow(user, account, row, configured, signal)
        .catch(() => resultFor(row, "error", "temporary"));
      results.set(row.id, result);
      if (result.reason === "recently_checked" || result.reason === "already_matched") remaining += count;
      if (result.reason === "rate_limited" || result.reason === "provider_auth") stop = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, ready.length) }, worker));
  const summary = { matched: 0, pending: 0, unavailable: 0, skipped: 0, error: 0 };
  const ordered = rows.map(row => {
    const result = results.get(row.id) ?? resultFor(row, "skipped", "deferred");
    summary[result.outcome]++;
    return result;
  });
  return { configured, results: ordered, summary };
}
