/** Read-only SIRAYA billing API. No model calls or credit transfers. */
const BASE = "https://console-api.siraya.ai/extapi/v1";
const DAY = 86_400_000;
export class BillingError extends Error {
  constructor(public code: string, public status = 502, public retryAfter: number | null = null) { super(code); }
}
export function consoleConfig() {
  const token = process.env.SIRAYA_CONSOLE_TOKEN?.trim();
  const accountId = process.env.SIRAYA_CONSOLE_ACCOUNT_ID?.trim();
  return { token, accountId, configured: !!token?.startsWith("csk-") && !!accountId && /^[\w-]{1,160}$/.test(accountId) };
}
export interface BillingRecord {
  requestId: string; accountId: string; timestamp: string; model: string;
  cost: string; currency: string; status: string;
  usage: Record<string, number>; performance: Record<string, number>;
}
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
export const validRequestId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v);
/** Integer micro-units: no float summation and no implicit currency conversion. */
export function decimalMicros(value: string): bigint {
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(value)) throw new BillingError("invalid_cost");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0"));
}
export function microsDecimal(value: bigint): string {
  if (value < BigInt(0)) return "-" + microsDecimal(-value);
  return `${value / BigInt(1000000)}.${String(value % BigInt(1000000)).padStart(6, "0")}`;
}
export function normalizeBillingRecord(value: unknown): BillingRecord {
  const raw = object(value);
  if (!raw || !validRequestId(raw.request_id) || typeof raw.account_id !== "string" || !/^[\w-]{1,160}$/.test(raw.account_id)
    || typeof raw.model !== "string" || !raw.model || raw.model.length > 160
    || typeof raw.status !== "string" || !/^[\w-]{1,64}$/.test(raw.status)
    || typeof raw.currency !== "string" || !/^[A-Z]{3}$/.test(raw.currency)
    || typeof raw.timestamp !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw.timestamp) || !Number.isFinite(Date.parse(raw.timestamp))) throw new BillingError("invalid_record");
  if (typeof raw.cost !== "number" || !Number.isFinite(raw.cost) || raw.cost < 0 || raw.cost >= 1e12) throw new BillingError("invalid_cost");
  const cost = raw.cost.toFixed(6);
  // Reject more than six non-rounding-error decimal places rather than silently rounding a bill.
  if (Math.abs(Number(cost) - raw.cost) > Math.max(1e-12, Number.EPSILON * raw.cost * 2)) throw new BillingError("invalid_cost_precision");
  decimalMicros(cost);
  const numbers = (input: unknown, allowed: string[]) => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(object(input) ?? {})) if (allowed.includes(key)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e12) throw new BillingError("invalid_usage");
      out[key] = value;
    }
    return out;
  };
  return { requestId: raw.request_id, accountId: raw.account_id, timestamp: new Date(raw.timestamp).toISOString(), model: raw.model,
    cost, currency: raw.currency, status: raw.status,
    usage: numbers(raw.usage, ["prompt_tokens", "completion_tokens", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens", "total_tokens", "video_seconds", "video_pixels", "image_count"]),
    performance: numbers(raw.performance, ["latency_ms", "ttft_ms"]) };
}
async function consoleGet(path: string, query: Record<string, string>, signal: AbortSignal) {
  const config = consoleConfig();
  if (!config.configured) throw new BillingError("not_configured", 503);
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  let response: Response;
  try { response = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` }, signal, cache: "no-store", redirect: "error" }); }
  catch { throw new BillingError(signal.aborted ? "sync_timeout" : "connection_failed", 503); }
  if (!response.ok) {
    const retry = Number(response.headers.get("retry-after"));
    throw new BillingError(`console_http_${response.status}`, response.status === 404 ? 404 : response.status === 429 ? 429 : 502,
      response.status === 429 && Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : null);
  }
  let body: Record<string, unknown> | null;
  try { body = object(await response.json()); } catch { throw new BillingError("invalid_response"); }
  if (body?.isSuccess !== true || !object(body.data)) throw new BillingError("invalid_response");
  return object(body.data)!;
}
export async function fetchUsageWindow(since: string, until: string, signal: AbortSignal): Promise<BillingRecord[]> {
  const start = Date.parse(since), end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start % 1000 || end % 1000 || end <= start || end - start > 31 * DAY) throw new BillingError("invalid_window", 400);
  const collected = new Map<string, BillingRecord>();
  for (let page = 1; page <= 100; page++) {
    const data = await consoleGet("/usage", { account_id: consoleConfig().accountId!, start: since, end: until, page: String(page), page_size: "100" }, signal);
    if (!Array.isArray(data.data) || data.page !== page || typeof data.has_more !== "boolean" || data.data.length > 100
      || (data.has_more && data.data.length === 0)) throw new BillingError("invalid_pagination");
    for (const raw of data.data) {
      const row = normalizeBillingRecord(raw);
      if (Date.parse(row.timestamp) < start || Date.parse(row.timestamp) >= end) throw new BillingError("outside_window");
      const key = row.accountId + ":" + row.requestId;
      const old = collected.get(key);
      // A moving page boundary must not be accepted as a complete financial snapshot.
      if (old) throw new BillingError("unstable_pagination");
      collected.set(key, row);
    }
    if (!data.has_more) return [...collected.values()];
  }
  // Never cross the provider's 10,000-row offset cap. Re-read two smaller windows.
  const middle = start + Math.floor((end - start) / 2000) * 1000;
  if (middle <= start || middle >= end) throw new BillingError("window_too_dense", 422);
  const left = await fetchUsageWindow(since, new Date(middle).toISOString(), signal);
  const right = await fetchUsageWindow(new Date(middle).toISOString(), until, signal);
  return left.concat(right);
}
export async function fetchUsageRequest(requestId: string, signal: AbortSignal) {
  if (!validRequestId(requestId)) throw new BillingError("invalid_request_id", 400);
  const row = normalizeBillingRecord(await consoleGet(`/usage/${encodeURIComponent(requestId)}`, {}, signal));
  if (row.requestId !== requestId) throw new BillingError("request_id_mismatch");
  // A token may see multiple accounts. Verify membership in the configured subtree before saving/returning it.
  const second = Math.floor(Date.parse(row.timestamp) / 1000) * 1000;
  const scoped = await fetchUsageWindow(new Date(second).toISOString(), new Date(second + 1000).toISOString(), signal);
  if (!scoped.some(r => r.accountId === row.accountId && r.requestId === row.requestId && r.cost === row.cost && r.currency === row.currency)) throw new BillingError("request_outside_scope", 404);
  return row;
}
/** Coverage means every second was successfully scanned; partial scans never count. */
export function billingCoverage(since: string, until: string, ranges: { since: string; until: string }[]) {
  const start = Date.parse(since), end = Date.parse(until);
  let cursor = start;
  const gaps: { since: string; until: string }[] = [];
  for (const range of ranges.map(r => [Math.max(start, Date.parse(r.since)), Math.min(end, Date.parse(r.until))]).filter(([s,e]) => e > s).sort((a,b) => a[0] - b[0])) {
    if (range[0] > cursor) gaps.push({ since: new Date(cursor).toISOString(), until: new Date(range[0]).toISOString() });
    cursor = Math.max(cursor, range[1]);
  }
  if (cursor < end) gaps.push({ since: new Date(cursor).toISOString(), until });
  return { complete: gaps.length === 0, gaps };
}
