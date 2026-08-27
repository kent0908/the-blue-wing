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

function getApiKey(): string {
  const key = process.env.SIRAYA_API_KEY;
  if (!key) {
    throw new SirayaConfigError(
      "SIRAYA_API_KEY is not set. Add it to .env.local (see .env.example) and restart the dev server."
    );
  }
  return key;
}

/**
 * Low-level fetch wrapper. Throws SirayaApiError using the documented
 * { error: { message, type, code } } shape on non-2xx responses.
 */
async function sirayaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = getApiKey();
  const res = await fetch(`${SIRAYA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `SIRAYA request failed with status ${res.status}`;
    let type: string | undefined;
    let code: string | number | undefined;
    try {
      const body = await res.json();
      if (body?.error) {
        message = body.error.message || message;
        type = body.error.type;
        code = body.error.code;
      }
    } catch {
      // response wasn't JSON — fall back to the generic message above
    }
    throw new SirayaApiError(res.status, message, type, code);
  }

  return res;
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
  model: string;
  prompt: string;
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
}

/** POST /images/generations */
export async function createImage(body: ImageGenerationRequest) {
  const res = await sirayaFetch("/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  seconds?: number;
  resolution?: "480p" | "720p" | "1080p";
  aspect_ratio?: string;
  generate_audio?: boolean;
  negative_prompt?: string;
  seed?: number;
  async?: boolean;
}

/** POST /videos/generations */
export async function createVideo(body: VideoGenerationRequest) {
  const res = await sirayaFetch("/videos/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

/** GET /videos/{id} — poll for async video job status. */
export async function getVideoStatus(id: string) {
  const res = await sirayaFetch(`/videos/${encodeURIComponent(id)}`, { method: "GET" });
  return res.json();
}
