import { randomUUID } from "node:crypto";
import { sql } from "./db";
export interface ModelRequestMeta { model: string; provider: string; requestId?: string; attempt?: number; }
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
  let outcome: RequestOutcome = "http";
  try {
    const response = await fetch(url, init);
    status = response.status;
    return response;
  } catch(error) {
    outcome = requestOutcome(error);
    throw error;
  } finally {
    const elapsed = Math.max(0, Date.now() - started);
    try {
      await sql`insert into model_request_events(request_id,model,provider,attempt,http_status,outcome,duration_ms)
        values(${requestId},${meta.model.slice(0,160)},${meta.provider.slice(0,40)},${meta.attempt ?? 1},${status},${outcome},${elapsed})`;
    } catch { console.error("Model request monitoring write failed"); }
  }
}
