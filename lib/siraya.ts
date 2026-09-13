import { applyWatermarkDefaults } from "./watermark";

/**
 * SIRAYA Model Router client (server-side only).
 *
 * Docs used to build this integration:
 *   https://docs.siraya.ai/docs/api-reference/authentication/
 *   https://docs.siraya.ai/docs/overview/quickstart/text/
 *   https://docs.siraya.ai/docs/api-reference/llm-model-api/overview/
 *   https://docs.siraya.ai/docs/api-reference/models-api/list-all-models/
 *   https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-image/
 *   https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/
 *   https://docs.siraya.ai/docs/api-reference/errors-code/
 *
 * Base URL: https://llm.siraya.ai/v1
 * Auth: Authorization: Bearer <SIRAYA_API_KEY>
 *
 * This file never runs in the browser — every export here is imported only
 * from route handlers under app/api/**, so the API key never reaches the
 * client bundle.
 */

const SIRAYA_BASE_URL = process.env.SIRAYA_BASE_URL || "https://llm.siraya.ai/v1";

export class SirayaConfigError extends Error {}

export class SirayaApiError extends Error {
  status: number;
  type?: string;
  code?: string | number;

  constructor(status: number, message: string, type?: string, code?: string | number) {
    super(message);
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

/** Only explicit billing rejections may replay a paid POST on the backup key. */
function isCreditExhausted(error: SirayaApiError): boolean {
  if (![400, 402, 403, 429].includes(error.status)) return false;
  if (error.status === 402) return true;
  const identifiers = [error.code, error.type].map(value => String(value ?? "").toLowerCase());
  if (identifiers.some(value => /^(insufficient_quota|insufficient_balance|insufficient_credits|credit_balance_too_low|quota_exceeded|quota_exhausted|balance_not_enough|account_balance_insufficient)$/.test(value))) return true;
  return /(?:insufficient|not enough) (?:account )?(?:balance|credits?|funds)|(?:balance|credits?) (?:is |are )?(?:insufficient|exhausted|too low)|(?:余额|餘額|额度|額度|点数|點數)不足/i.test(error.message);
}

async function responseError(res: Response): Promise<SirayaApiError> {
  let message = `SIRAYA request failed with status ${res.status}`;
  let type: string | undefined;
  let code: string | number | undefined;
  try {
    const body = await res.json();
    if (body?.error) {
      message = typeof body.error.message === "string" ? body.error.message : message;
      type = body.error.type;
      code = body.error.code;
    }
  } catch { /* Preserve the HTTP status for non-JSON errors. */ }
  return new SirayaApiError(res.status, message, type, code);
}

/** Each request starts with Key 1; no shared mutable credential selection. */
async function sirayaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const keys = [...new Set([process.env.SIRAYA_API_KEY, process.env.SIRAYA_API_KEY_2]
    .map(key => key?.trim()).filter((key): key is string => Boolean(key)))];
  if (!keys.length) throw new SirayaConfigError("SIRAYA API key is not configured.");
  const isVideoLookup = init.method === "GET" && path.startsWith("/videos/");
  for (let index = 0; index < keys.length; index++) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${keys[index]}`);
    headers.set("Content-Type", "application/json");
    // Network errors and accepted streaming responses are never replayed.
    const res = await fetch(`${SIRAYA_BASE_URL}${path}`, { ...init, headers });
    if (res.ok) return res;
    const error = await responseError(res);
    const canReplay = init.body == null || typeof init.body === "string";
    // Jobs may belong to the other API key. Read-only lookup can try that key
    // when the primary cannot access the job; this never creates another job.
    const lookupDenied = isVideoLookup && [401, 403, 404].includes(error.status);
    if (index + 1 < keys.length && canReplay && (isCreditExhausted(error) || lookupDenied)) continue;
    throw error;
  }
  throw new SirayaConfigError("SIRAYA API key is not configured.");
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

/** POST /chat/completions (non-streaming). */
export async function createChatCompletion(body: ChatCompletionRequest) {
  const res = await sirayaFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ ...body, stream: false }),
  });
  return res.json();
}

/** POST /chat/completions (streaming) — returns the raw Response so the
 *  route handler can pipe the SSE stream straight through to the client. */
export async function createChatCompletionStream(body: ChatCompletionRequest) {
  return sirayaFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ ...body, stream: true }),
  });
}

/** GET /models */
export async function listModels() {
  const res = await sirayaFetch("/models", { method: "GET" });
  return res.json();
}

export interface ImageGenerationRequest {
  layer_decomposition?: boolean;
  output_format?: "png" | "jpeg";
  model: string;
  prompt: string;
  /**
   * Reference image(s) for image-to-image. The field is `image` (not
   * `image_urls`) and DOES accept an array — verified empirically: sending
   * two distinct reference images produced an output combining both. Each
   * entry is a URL or a base64 data URL.
   */
  image?: string | string[];
  n?: number;
  size?: string;
  quality?: string;
  style?: string;
  response_format?: "b64_json" | "url";
  negative_prompt?: string;
  seed?: number;
  /** GPT-Image: transparent | opaque | auto */
  background?: string;
  /** GPT-Image: 0-100, jpeg/webp only */
  output_compression?: number;
  moderation?: string;
  /**
   * Seedream: adds a visible "AI generated" watermark when true. Docs claim
   * default false, but real output shows one unless this is explicitly sent
   * — verified empirically. We always send `false`.
   */
  watermark?: boolean;
  /** model-specific passthrough */
  extra_body?: Record<string, unknown>;
}

/** POST /images/generations */
export async function createImage(body: ImageGenerationRequest) {
  // GPT reference inputs use edits; generations does not accept image inputs.
  if (/^(?:(?:SIRAYA|NSFW)-)*gpt-image-/i.test(body.model) && body.image) {
    const { image, ...settings } = body;
    delete settings.response_format;
    return createImageEdit({
      ...settings,
      image_urls: Array.isArray(image) ? image : [image],
    });
  }
  const res = await sirayaFetch("/images/generations", {
    method: "POST",
    body: JSON.stringify(applyWatermarkDefaults(body, "image")),
  });
  return res.json();
}

/**
 * A genuinely separate endpoint from /images/generations — verified live
 * on 2026-09-06: SIRAYA-Dola-Seedream-5.0-pro accepts real image_urls (http
 * or base64 data URL) plus an optional mask_url and returns a real edited
 * image (b64_json), both with and without a mask. `output_format` here
 * only accepts "png"/"jpeg" — "url" (the default elsewhere in this app)
 * gets rejected outright, so this always requests png.
 */
export interface ImageEditRequest {
  model: string;
  prompt: string;
  /** URL(s) or base64 data URL(s) of the source image(s) to edit */
  image_urls: string[];
  /** URL or base64 data URL — transparent/white marks the region to edit, per SIRAYA's own docs */
  mask_url?: string;
  n?: number;
  size?: string;
  quality?: string;
  background?: string;
  output_compression?: number;
  moderation?: string;
  /**
   * Same Seedream "AI generated" watermark quirk as /images/generations
   * (see ImageGenerationRequest) — but for THIS endpoint specifically, the
   * top-level `watermark` field (what /images/generations uses) does
   * nothing at all: verified live (2026-09-06) with three separate variants
   * (`watermark:false`, `water_mark:false`, and simply omitting it) all
   * producing an identical visible badge. `extra_body.watermark:false` is
   * what actually suppresses it for /images/edits — confirmed by a matched
   * pair of otherwise-identical requests, badge present without it, gone
   * with it.
   */
  extra_body?: { watermark?: boolean };
}

/** POST /images/edits */
export async function createImageEdit(body: ImageEditRequest) {
  const res = await sirayaFetch("/images/edits", {
    method: "POST",
    body: JSON.stringify({ ...applyWatermarkDefaults(body, "imageEdit"), output_format: "png" }),
  });
  return res.json();
}

export interface VideoInputReference {
  type: "image" | "video" | "audio";
  url: string;
}

export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  seconds?: number;
  resolution?: "480p" | "720p" | "1080p" | "4k";
  aspect_ratio?: string;
  generate_audio?: boolean;
  negative_prompt?: string;
  seed?: number;
  async?: boolean;
  /**
   * Multi-reference materials (image/video/audio) for models that support
   * subject/style/scene references — Seedance family. Verified empirically:
   * SIRAYA validates each entry's `url` (rejects images under ~300px) before
   * accepting the job, and accepts both plain URLs and base64 data URLs.
   * A `role` field is documented but its valid values aren't — omit it.
   */
  input_references?: VideoInputReference[];
  /**
   * Model-specific passthrough. `camera_fixed` (boolean) is real — verified
   * empirically — but only valid in image-to-video (i.e. with a reference
   * attached); sending it in pure text-to-video is rejected. NOT universal
   * within Seedance, though: verified live (2026-09-07) that the 2.0-mini
   * line rejects it the OTHER way — "the specified parameter camera_fixed is
   * not supported for model dreamina-seedance-2-0-mini in r2v, must be
   * empty" — i.e. for that specific model it's invalid precisely when a
   * reference IS attached. lib/characterIdleVideo.ts doesn't send it at all
   * for this reason; a future caller wanting it for OTHER Seedance versions
   * should still verify per-model before relying on this comment's older
   * claim. `watermark` (boolean) is also real for Seedance — verified
   * empirically by generating the same clip with both values and comparing
   * frames: the "AI generated" badge only appears when true. We always send
   * one explicitly (default false) — see app/api/videos/route.ts.
   */
  extra_body?: Record<string, unknown>;
}

/** POST /videos/generations */
export async function createVideo(body: VideoGenerationRequest) {
  const res = await sirayaFetch("/videos/generations", {
    method: "POST",
    body: JSON.stringify(applyWatermarkDefaults(body, "video")),
  });
  return res.json();
}

/** GET /videos/{id} — poll for async video job status. */
export async function getVideoStatus(id: string) {
  const res = await sirayaFetch(`/videos/${encodeURIComponent(id)}`, { method: "GET" });
  return res.json();
}
