/** Verified SIRAYA Seedance 2.5 draft wire contract; never accept native task IDs from a client. */
export const SEEDANCE_DRAFT_MODEL = "SIRAYA-Seedance-2.5";
export const SEEDANCE_DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const draftRequestIdValid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const draftGatewayIdValid = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,2000}$/.test(value);
const nativeIdValid = (value: unknown): value is string => typeof value === "string" && /^cgt-[a-zA-Z0-9-]{1,120}$/.test(value);

/** SIRAYA currently exposes the native draft ID only in the trusted provider output filename. */
export function extractDraftUpstreamId(result: Record<string, unknown>): string | null {
  const vendor = result.vendor_data as Record<string, unknown> | undefined;
  if (vendor?.draft !== true) return null;
  if (nativeIdValid(vendor.task_id)) return vendor.task_id;
  if (nativeIdValid(result.upstream_task_id)) return result.upstream_task_id;
  const output = result.output_url;
  if (typeof output !== "string") return null;
  try {
    const url = new URL(output);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".volces.com")) return null;
    const id = decodeURIComponent(url.pathname).match(/\/(cgt-[a-zA-Z0-9-]{1,120})\.(?:mp4|mov)$/i)?.[1];
    return nativeIdValid(id) ? id : null;
  } catch { return null; }
}

export function draftExpiryFromReceipt(result: Record<string, unknown>, submittedAt: string, now = Date.now()): string {
  const vendor = result.vendor_data as Record<string, unknown> | undefined;
  const unix = vendor?.created_at;
  const submitted = new Date(submittedAt).getTime();
  // A provider timestamp can only shorten the conservative submission-based window.
  const created = typeof unix === "number" && Number.isFinite(unix) && unix > 0 && unix * 1000 <= now + 300_000
    ? Math.min(unix * 1000, submitted) : submitted;
  return new Date(created + SEEDANCE_DRAFT_LIFETIME_MS).toISOString();
}

export function draftCanFinalize(row: { status: string; upstream_task_id: string | null; expires_at: string; final_status: string | null }, now = Date.now()): boolean {
  return row.status === "completed" && nativeIdValid(row.upstream_task_id) && new Date(row.expires_at).getTime() > now && (row.final_status === null || row.final_status === "failed");
}

/** Never re-send inherited prompt, references, audio, seed, ratio or duration. */
export function buildDraftFinalPayload(upstreamId: string) {
  if (!nativeIdValid(upstreamId)) throw new Error("Invalid native draft task");
  return {
    model: SEEDANCE_DRAFT_MODEL,
    resolution: "1080p" as const,
    async: true,
    extra_body: { content: [{ type: "draft_task", draft_task: { id: upstreamId } }], draft: false, watermark: false },
  };
}
