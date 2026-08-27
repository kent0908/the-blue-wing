/**
 * Cost estimation.
 *
 * SIRAYA bills text by tokens, images per image (n × image_price) and video
 * per second (seconds × video_second_price) — see
 * https://docs.siraya.ai/docs/observability/billing-transparency/
 *
 * Exact per-model rates live on console.siraya.ai/models and are not exposed
 * in the public docs, so these are ESTIMATES used for the pre-flight quote in
 * the UI. Actual charges come back in the `usage` object of every response and
 * are what the UI shows after a run. Adjust the table below once you have your
 * account's real rate card.
 */

export type Modality = "text" | "image" | "video";

export interface RateCard {
  /** USD per 1M input tokens */
  inputPerMTok?: number;
  /** USD per 1M output tokens */
  outputPerMTok?: number;
  /** USD per generated image */
  perImage?: number;
  /** USD per second of generated video */
  perSecond?: number;
}

/** Matched by longest-prefix against the model id. */
const RATES: Array<[string, RateCard]> = [
  // ---- video ----
  ["veo3.1", { perSecond: 0.4 }],
  ["veo", { perSecond: 0.35 }],
  ["sora-2", { perSecond: 0.3 }],
  ["sora", { perSecond: 0.3 }],
  ["seedance-2.5", { perSecond: 0.15 }],
  ["seedance-2.0", { perSecond: 0.12 }],
  ["seedance", { perSecond: 0.1 }],
  // ---- image ----
  ["gpt-image-2", { perImage: 0.04 }],
  ["imagen-4", { perImage: 0.04 }],
  ["nano-banana", { perImage: 0.03 }],
  ["seedream", { perImage: 0.03 }],
  ["bytedance-seedream-4.5", { perImage: 0.04 }],
  ["dola-seedream-5.0-lite", { perImage: 0.035 }],
  ["dola-seedream-5.0-pro", { perImage: 0.045 }],
  ["gemini-2.5-flash-image", { perImage: 0.03 }],
  ["gemini-3.1-flash-lite-image", { perImage: 0.02 }],
  ["gemini-3.1-flash-image", { perImage: 0.04 }],
  ["gemini-3-pro-image", { perImage: 0.06 }],
  // ---- text ----
  ["claude-opus", { inputPerMTok: 15, outputPerMTok: 75 }],
  ["claude-sonnet", { inputPerMTok: 3, outputPerMTok: 15 }],
  ["claude-haiku", { inputPerMTok: 0.8, outputPerMTok: 4 }],
  ["gpt-5", { inputPerMTok: 1.25, outputPerMTok: 10 }],
  ["gpt-4o", { inputPerMTok: 2.5, outputPerMTok: 10 }],
  ["gemini-3", { inputPerMTok: 1.25, outputPerMTok: 10 }],
  ["gemini", { inputPerMTok: 0.5, outputPerMTok: 3 }],
  ["deepseek", { inputPerMTok: 0.28, outputPerMTok: 0.42 }],
  ["qwen", { inputPerMTok: 0.3, outputPerMTok: 0.9 }],
  ["kimi", { inputPerMTok: 0.6, outputPerMTok: 2.5 }],
  ["glm", { inputPerMTok: 0.4, outputPerMTok: 1.6 }],
  ["grok", { inputPerMTok: 3, outputPerMTok: 15 }],
  ["minimax", { inputPerMTok: 0.4, outputPerMTok: 2.2 }],
  ["llama", { inputPerMTok: 0.2, outputPerMTok: 0.6 }],
];

const FALLBACK: RateCard = { inputPerMTok: 1, outputPerMTok: 4, perImage: 0.04, perSecond: 0.2 };

export function rateFor(modelId: string): RateCard {
  const id = modelId.toLowerCase();
  let best: RateCard | null = null;
  let bestLen = -1;
  for (const [prefix, card] of RATES) {
    if (id.includes(prefix) && prefix.length > bestLen) {
      best = card;
      bestLen = prefix.length;
    }
  }
  return best ?? FALLBACK;
}

/** Rough token estimate — good enough for a pre-flight quote. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[㐀-鿿豈-﫿]/g) || []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}

export interface EstimateInput {
  model: string;
  modality: Modality;
  prompt: string;
  maxTokens?: number;
  imageCount?: number;
  seconds?: number;
}

export function estimateCost(input: EstimateInput): number {
  const rate = rateFor(input.model);
  switch (input.modality) {
    case "image":
      return (rate.perImage ?? FALLBACK.perImage!) * (input.imageCount ?? 1);
    case "video":
      return (rate.perSecond ?? FALLBACK.perSecond!) * (input.seconds ?? 5);
    case "text":
    default: {
      const inTok = estimateTokens(input.prompt);
      const outTok = input.maxTokens ?? 1024;
      return (
        (inTok / 1_000_000) * (rate.inputPerMTok ?? FALLBACK.inputPerMTok!) +
        (outTok / 1_000_000) * (rate.outputPerMTok ?? FALLBACK.outputPerMTok!)
      );
    }
  }
}

export function formatUSD(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Classify a model id into a modality using its id and SIRAYA's model families. */
export function modalityOf(modelId: string): Modality {
  const id = modelId.toLowerCase();
  if (/veo|sora|seedance|video|wan|kling|hailuo/.test(id)) return "video";
  if (/image|imagen|seedream|nano-banana|flux|dall/.test(id)) return "image";
  return "text";
}
