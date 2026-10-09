/** Retain billing numbers only. Never store the full response, prompts or signed URLs. */
export interface ProviderReceipt { costUsd: number | null; usage: Record<string, number>; }
const keys = new Set(["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "cached_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "prompt_cache_hit_tokens", "prompt_cache_miss_tokens", "reasoning_tokens", "text_tokens", "image_tokens", "audio_tokens", "video_tokens", "video_seconds", "video_pixels", "image_count"]);
const containers = new Set(["prompt_tokens_details", "completion_tokens_details", "input_tokens_details", "output_tokens_details"]);
function object(v: unknown): Record<string, unknown> | null { return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null; }
export function extractProviderReceipt(value: unknown): ProviderReceipt | null {
  const body = object(value);
  if (!body) return null;
  // SIRAYA documents numeric top-level cost in USD. Do not guess nested costs,
  // alternative currencies, or whether this value includes a supplier discount.
  const cost = body.cost;
  const costUsd = typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && cost < 1e9 ? cost : null;
  const usage: Record<string, number> = {};
  const raw = object(body.usage);
  if (raw) for (const [key, val] of Object.entries(raw)) {
    if (keys.has(key) && typeof val === "number" && Number.isFinite(val) && val >= 0 && val <= 1e12) usage[key] = val;
    if (containers.has(key)) for (const [subkey, n] of Object.entries(object(val) ?? {}))
      if (keys.has(subkey) && typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e12) usage[`${key}.${subkey}`] = n;
  }
  return costUsd !== null || Object.keys(usage).length ? { costUsd, usage } : null;
}

/** Observe SSE billing metadata while preserving every byte and backpressure. */
export function observeBillingStream(source: ReadableStream<Uint8Array>, save: (receipt: unknown) => Promise<void>, onEmpty?: () => Promise<void>) {
  const decoder = new TextDecoder();
  let pending = "";
  let discarding = false;
  let deliveredText = false;
  async function line(value: string) {
    if (!value.startsWith("data:")) return;
    try {
      const body = JSON.parse(value.slice(5).trim());
      if (Array.isArray(body?.choices)) for (const choice of body.choices) {
        const text = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
        if (typeof text === "string" && text.trim()) deliveredText = true;
      }
      if (extractProviderReceipt(body)) await save(body);
    } catch { /* Malformed/absent metadata must never interrupt paid output. */ }
  }
  const observed = source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      controller.enqueue(chunk);
      let text = decoder.decode(chunk, {stream:true});
      if (discarding) {
        const end = text.indexOf("\n");
        if (end < 0) return;
        text = text.slice(end + 1); discarding = false;
      }
      pending += text;
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        const value = pending.slice(0,end); pending = pending.slice(end + 1);
        if (value.length <= 65536) await line(value);
      }
      if (pending.length > 65536) { pending = ""; discarding = true; }
    },
    async flush() { if (!discarding && pending) await line(pending + decoder.decode()); },
  }));
  if (!onEmpty) return observed;
  const reader = observed.getReader();
  let refund: Promise<void> | undefined;
  const refundEmpty = () => deliveredText ? Promise.resolve() : (refund ??= onEmpty());
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          await refundEmpty();
          controller.close();
          reader.releaseLock();
        } else controller.enqueue(next.value);
      } catch (error) {
        try { await refundEmpty(); } catch { console.error("Empty stream refund failed"); }
        controller.error(error);
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); }
      finally { try { await refundEmpty(); } finally { reader.releaseLock(); } }
    },
  });
}
