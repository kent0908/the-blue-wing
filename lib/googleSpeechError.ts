/** Keep provider diagnostics out of ordinary API responses. Only the fixed-text admin test exposes this detail. */
export class GoogleSpeechError extends Error {
  constructor(public readonly httpStatus:number, public readonly providerCode:string, public readonly adminDetail:string) {
    super(`Gemini 3.8 語音生成失敗（HTTP ${httpStatus} ${providerCode}）`);
    this.name="GoogleSpeechError";
  }
}
export function googleSpeechError(status:number, body:unknown, authHeaders:Record<string,string>):GoogleSpeechError {
  const error=(body && typeof body === "object" ? (body as {error?:unknown}).error : null) as {code?:unknown;status?:unknown;message?:unknown;details?:{reason?:unknown}[]} | null;
  const reason=Array.isArray(error?.details) ? error.details.find(d=>typeof d?.reason==="string")?.reason : undefined;
  const raw=reason ?? error?.status ?? error?.code;
  const code=typeof raw==="string" && /^[a-z_]{1,80}$/i.test(raw) ? raw.toUpperCase() : "PROVIDER_ERROR";
  let detail=typeof error?.message==="string" ? error.message : "No provider description";
  for (const [key,value] of Object.entries(authHeaders)) {
    if (/authorization|api-key/i.test(key) && value) {
      detail=detail.split(value).join("[redacted]");
      if (/^Bearer /i.test(value)) detail=detail.split(value.slice(7)).join("[redacted]");
    }
  }
  detail=detail.replace(/(?:AIza|ya29\.|sk-)[A-Za-z0-9_.-]+/g,"[redacted]").replace(/[\x00-\x1f]/g," ").slice(0,800);
  return new GoogleSpeechError(status,code,detail);
}
