import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { billingChargeId } from "./billingContext";
export interface ModelRequestMeta { model: string; provider: string; requestId?: string; attempt?: number; keySlot?: string; }
export type RequestOutcome = "http" | "timeout" | "network_error" | "cancelled";
export function requestOutcome(error: unknown): RequestOutcome {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return name === "TimeoutError" ? "timeout" : name === "AbortError" ? "cancelled" : "network_error";
}
/** Numeric transport metadata only: never persist payloads, headers, keys or response text. */
export async function monitoredModelFetch(url: string, init: RequestInit, meta: ModelRequestMeta): Promise<Response> {
  const started = Date.now();
  const requestId = meta.requestId ?? randomUUID();
  let status: number | null = null;
  let upstreamRequestId: string | null = null;
  const chargeId = billingChargeId();
  let outcome: RequestOutcome = "http";
  try {
    const response = await fetch(url, init);
    status = response.status;
    const header = response.headers.get("x-request-id");
    upstreamRequestId = header && /^[A-Za-z0-9_.:-]{1,160}$/.test(header) ? header : null;
    return response;
  } catch(error) {
    outcome = requestOutcome(error);
    throw error;
  } finally {
    const elapsed = Math.max(0, Date.now() - started);
    try {
      await sql`insert into model_request_events(request_id,model,provider,attempt,http_status,outcome,duration_ms,upstream_request_id,charge_id,key_slot)
        values(${requestId},${meta.model.slice(0,160)},${meta.provider.slice(0,40)},${meta.attempt ?? 1},${status},${outcome},${elapsed},${upstreamRequestId},${chargeId},${meta.keySlot ?? null})`;
    } catch { console.error("Model request monitoring write failed"); }
  }
}
