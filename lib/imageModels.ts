import { modelLabel } from "./modelLabel";
import { canonicalBillingModel } from "./billingModel";
/**
 * Image-generation model catalogue.
 *
 * The cards on /models and the parameter controls in the Composer are both
 * driven by this file. Each model declares only the controls its family
 * actually accepts, so the UI "auto-switches" the parameter set when you pick a
 * different model, and buildImagePayload() only ever sends supported keys.
 *
 * Parameter semantics come from the SIRAYA text-to-image reference:
 *   https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-image/
 *
 *   size                 1024x1024 | 1792x1024 | 1024x1792
 *   quality              low | medium | high        (GPT-Image)
 *   background           transparent | opaque | auto (GPT-Image)
 *   output_compression   0-100                       (GPT-Image, jpeg/webp)
 *   negative_prompt      Imagen / Seedream only
 *   seed                 Imagen / Seedream only
 *   n                    1-10, all families
 */

export type ImageFamily = "seedream" | "gemini" | "gpt-image";

export type ImageControlKey =
  | "size"
  | "n"
  | "quality"
  | "style"
  | "background"
  | "output_compression"
  | "negative_prompt"
  | "seed";

export interface ImageControl {
  key: ImageControlKey;
  label: string;
  kind: "select" | "number" | "text";
  /** for kind === "select" */
  options?: { value: string; label: string }[];
  /** for kind === "number" */
  min?: number;
  max?: number;
  step?: number;
  default?: string | number;
  placeholder?: string;
}

export interface ImageModel {
  /** exact id sent to POST /v1/images/generations */
  id: string;
  name: string;
  family: ImageFamily;
  /** short pricing line shown on the card */
  price: string;
  blurb: string;
  tags: string[];
  controls: ImageControl[];
  /**
   * Upstream generation routinely takes >60s — will time out on Vercel Hobby
   * (60s function cap) and only completes on Pro (300s). Surfaced as a hint in
   * the UI so users aren't surprised.
   */
  slow?: boolean;
}

/* ---- reusable control fragments ---- */

const SIZE: ImageControl = {
  key: "size",
  label: "尺寸",
  kind: "select",
  default: "1024x1024",
  options: [
    { value: "1024x1024", label: "1:1 · 1024×1024" },
    { value: "1792x1024", label: "16:9 · 1792×1024" },
    { value: "1024x1792", label: "9:16 · 1024×1792" },
  ],
};

/**
 * Seedream 4.5 and the Dola Seedream 5.0 models reject anything below
 * 3,686,400 px (≈ 1920²). These are the smallest valid sizes per aspect ratio.
 */
const SIZE_HIRES: ImageControl = {
  key: "size",
  label: "尺寸",
  kind: "select",
  default: "2048x2048",
  options: [
    { value: "2048x2048", label: "1:1 · 2048×2048" },
    { value: "2560x1440", label: "16:9 · 2560×1440" },
    { value: "1440x2560", label: "9:16 · 1440×2560" },
    { value: "2304x1728", label: "4:3 · 2304×1728" },
  ],
};

const COUNT: ImageControl = {
  key: "n",
  label: "生成張數",
  kind: "number",
  min: 1,
  max: 10,
  step: 1,
  default: 1,
};

const QUALITY: ImageControl = {
  key: "quality",
  label: "品質",
  kind: "select",
  default: "high",
  options: [
    { value: "low", label: "低（快、省點數）" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
  ],
};

const BACKGROUND: ImageControl = {
  key: "background",
  label: "背景",
  kind: "select",
  default: "auto",
  options: [
    { value: "auto", label: "自動" },
    { value: "opaque", label: "不透明" },
    { value: "transparent", label: "透明（PNG/WebP）" },
  ],
};

const COMPRESSION: ImageControl = {
  key: "output_compression",
  label: "壓縮率",
  kind: "number",
  min: 0,
  max: 100,
  step: 5,
  default: 100,
};

const NEGATIVE: ImageControl = {
  key: "negative_prompt",
  label: "負向提示詞",
  kind: "text",
  placeholder: "不想出現的元素，例如：模糊、多餘手指、浮水印",
};

const SEED: ImageControl = {
  key: "seed",
  label: "隨機種子",
  kind: "number",
  min: 0,
  max: 2_147_483_647,
  step: 1,
  placeholder: "留空為隨機",
};

/** GPT Image 2 supports flexible dimensions, including portrait 4K.
 * Keep these curated choices within the model's 3840px edge / 8,294,400px limits.
 */
const SIZE_GPT_IMAGE: ImageControl = {
  key: "size",
  label: "尺寸",
  kind: "select",
  default: "1024x1024",
  options: [
    { value: "1024x1024", label: "1:1 · 1024×1024" },
    { value: "1536x1024", label: "3:2 · 1536×1024" },
    { value: "1024x1536", label: "2:3 · 1024×1536" },
    { value: "2048x1152", label: "16:9 · 2K" },
    { value: "1152x2048", label: "9:16 · 2K" },
    { value: "3840x2160", label: "16:9 · 4K" },
    { value: "2160x3840", label: "9:16 · 4K" },
  ],
};

const SEEDREAM_CONTROLS: ImageControl[] = [SIZE, COUNT, NEGATIVE, SEED];
// Seedream 4.5 / Dola 5.0 require ≥ 3,686,400 px
const SEEDREAM_HIRES_CONTROLS: ImageControl[] = [SIZE_HIRES, COUNT, NEGATIVE, SEED];
const GEMINI_CONTROLS: ImageControl[] = [SIZE, COUNT];
const GPT_IMAGE_CONTROLS: ImageControl[] = [SIZE_GPT_IMAGE, QUALITY, BACKGROUND, COMPRESSION, COUNT];

/* ---- the catalogue (order matches the console model grid) ---- */

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "ByteDance-Seedream-4.0",
    name: "Seedream 4.0",
    family: "seedream",
    price: "$0.03 / 張",
    blurb: "高性價比的通用文生圖，中文語意表現穩定。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_CONTROLS,
  },
  {
    id: "ByteDance-Seedream-4.5",
    name: "Seedream 4.5",
    family: "seedream",
    price: "$0.04 / 張",
    blurb: "4.0 的升級版，細節與構圖更完整。僅支援 2K 以上尺寸。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_HIRES_CONTROLS,
  },
  {
    id: "Dola-Seedream-5.0-lite",
    name: "Seedream 5.0 lite",
    family: "seedream",
    price: "$0.035 / 張",
    blurb: "第五代輕量版，速度快、成本低。僅支援 2K 以上尺寸。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_HIRES_CONTROLS,
  },
  {
    id: "Dola-Seedream-5.0-pro",
    name: "Seedream 5.0 pro",
    family: "seedream",
    price: "$0.045 / 張",
    blurb: "生產級視覺創作，質感與提示詞跟隨度最佳。僅支援 2K 以上尺寸。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_HIRES_CONTROLS,
  },
  {
    id: "gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    family: "gemini",
    price: "輸出圖像 $30 / 1M tokens",
    blurb: "Google 多模態生圖，適合圖文混合、局部編修。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: GEMINI_CONTROLS,
  },
  {
    id: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    family: "gemini",
    price: "輸出圖像 $60 / 1M tokens",
    blurb: "新一代 Flash 生圖，指令理解與版面控制更強。",
    tags: ["PROMPT CACHING", "REASONING", "VISION"],
    controls: GEMINI_CONTROLS,
  },
  {
    id: "gemini-3.1-flash-lite-image",
    name: "Gemini 3.1 Flash Lite Image",
    family: "gemini",
    price: "Flash Lite 級距",
    blurb: "最省的 Gemini 生圖檔位，適合大量草稿。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: GEMINI_CONTROLS,
  },
  {
    id: "gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    family: "gemini",
    price: "Pro 級距",
    blurb: "Gemini 生圖旗艦，複雜場景與文字排版最穩。生成較慢。",
    tags: ["REASONING", "VISION", "IMAGE GENERATION"],
    controls: GEMINI_CONTROLS,
    slow: true,
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    family: "gpt-image",
    price: "$0.04 / 張",
    blurb: "OpenAI 生圖，支援品質檔位與透明背景輸出。生成較慢（常超過 60 秒）。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: GPT_IMAGE_CONTROLS,
    slow: true,
  },
];

/**
 * Cleans up a raw model id for display in the picker — strips vendor/router
 * prefixes that are just upstream plumbing (SIRAYA- the router, ByteDance-
 * and Dola- the underlying model vendor for Seedream/Seedance) for models
 * that aren't in the curated catalogue (video models mostly, which have no
 * catalogue entry so the raw id is shown as-is otherwise). This is the
 * client-safe twin of lib/modelDisplay.ts's cleanModelName (same regex,
 * duplicated rather than shared — that file touches the DB at import time,
 * which has no business in a browser bundle); /api/models applies the full
 * override-aware version server-side, so a live-loaded model list already
 * carries the real displayName and this is only the pre-load/no-override
 * fallback.
 *
 * Deliberately does NOT touch an "NSFW-" prefix, even though the ask that
 * prompted this was to strip that too and quietly point the plain model name
 * at the NSFW-tagged backend instead. That would mean two differently-
 * moderated models rendering with the identical label (or the safe one gone
 * entirely) — a real subscriber picking "Seedance 2.5" would have no way to
 * know they'd actually get the unmoderated one. Router-prefix cleanup is
 * cosmetic; the NSFW/SIRAYA split is the one piece of information that lets
 * someone tell the two apart, so it stays visible.
 */
export function displayModelName(id: string): string {
  return modelLabel(id);
}

/**
 * Resolves the curated catalogue entry for an EXACT model id — deliberately
 * does NOT strip an "NSFW-" prefix, unlike getImageModelForControls() below.
 * Every caller here is display-name-adjacent (falls back to this when
 * /api/models' own displayName is missing, or feeds a catalogue "name" into
 * lib/modelDisplay.ts's resolveModelDisplay) — matching an NSFW id to its
 * safe twin's entry would surface that twin's bare name/id, making an
 * NSFW-* model render under the exact same label as its differently-
 * moderated counterpart. See lib/modelDisplay.ts's cleanModelName for the
 * same reasoning; getImageModelForControls is the prefix-aware sibling for
 * the one thing that's actually safe to share (behavior/parameters).
 */
export function getImageModel(id: string | null | undefined): ImageModel | undefined {
  if (!id) return undefined;
  const lower = id.toLowerCase();
  return (
    IMAGE_MODELS.find((m) => m.id === id) ||
    IMAGE_MODELS.find((m) => m.id.toLowerCase() === lower)
  );
}

/**
 * Same lookup, but matches an "NSFW-"-prefixed id against its underlying
 * (safe) catalogue entry — for resolving which CONTROLS/behavior apply
 * (reference-image support, size limits, negative_prompt/seed, ...), never
 * for display. Found via a real bug hunt (2026-09-06): Composer.tsx used
 * plain getImageModel() for this, so every NSFW-* Seedream variant (same
 * underlying model, unmoderated) fell through to undefined — losing
 * reference-image support, negative_prompt/seed controls, and the hires
 * SIZE default entirely, silently degrading to the generic 1024x1024
 * fallback. (Verified live that the smaller size did NOT actually get
 * rejected by SIRAYA for NSFW-Dola-Seedream-5.0-pro — so this wasn't
 * causing outright failures, just a real, silent loss of every other
 * per-model control the non-NSFW twin has.) Callers must still send the
 * ORIGINAL id in the actual request — see buildImagePayload's `modelId`
 * param — never `.id` off the object this returns, which is the safe twin's.
 */
export function getImageModelForControls(id: string | null | undefined): ImageModel | undefined {
  if (!id) return undefined;
  return getImageModel(id.replace(/^NSFW-/i, "")) ?? getImageModel(canonicalBillingModel(id.replace(/^NSFW-/i, "")));
}

const ALL_KNOWN_SIZES = Array.from(
  new Set([...(SIZE.options ?? []), ...(SIZE_HIRES.options ?? []), ...(SIZE_GPT_IMAGE.options ?? [])].map((o) => o.value))
);

/**
 * Which `size` values are actually valid for a model — found via a
 * data-accuracy audit (2026-09-07) after the same "one shared template for
 * every model" mistake was found (and fixed) for video resolution/duration:
 * 智慧畫布's image node offered the SAME flat lib/types.ts IMAGE_SIZES list
 * (["1024x1024","1024x1536","1536x1024","1792x1024"]) no matter which model
 * was selected — regardless of whether that model needs the ≥3,686,400px
 * "hires" tier (Seedream 4.5 / Dola 5.0, see SIZE_HIRES above) and, worse,
 * "1024x1536"/"1536x1024" aren't even in generationValidation.ts's own
 * allowed-size regex, so the canvas could offer choices our own server
 * would then reject. Returns the model's own real size options; falls back
 * to the full known set (permissive, not blocking) for an uncatalogued
 * model rather than guessing which subset is safe.
 */
export function sizeOptionsFor(modelId: string | null | undefined): string[] {
  const model = getImageModelForControls(modelId);
  if (!model) return ALL_KNOWN_SIZES;
  const sizeControl = model.controls.find((c) => c.key === "size");
  return sizeControl?.options?.map((o) => o.value) ?? ALL_KNOWN_SIZES;
}

/** Families that accept a reference image (image-to-image) via the `image` field. */
const REF_IMAGE_FAMILIES: ImageFamily[] = ["seedream", "gemini", "gpt-image"];
export function supportsRefImages(model: ImageModel | undefined): boolean {
  return !!model && REF_IMAGE_FAMILIES.includes(model.family);
}

/**
 * Families that accept the `watermark` field. Seedream is verified to accept
 * it (real output has a visible "AI generated" badge unless set false).
 * GPT Image 2 is verified to REJECT it outright — "Unknown parameter:
 * 'watermark'" — since it proxies straight to OpenAI's own images API, which
 * validates against a fixed parameter list. Gemini isn't independently
 * confirmed either way, so it's kept out of this list too rather than
 * assumed safe.
 */
const WATERMARK_FAMILIES: ImageFamily[] = ["seedream"];
export function supportsWatermarkControl(model: ImageModel | undefined): boolean {
  return !!model && WATERMARK_FAMILIES.includes(model.family);
}

/**
 * Max reference images accepted per generation. SIRAYA's `image` field takes
 * either a single URL/data-URL or an array — verified empirically (two
 * distinct reference images produced a result combining both). BytePlus's own
 * Seedream docs cite up to 10–14 depending on model; kept conservative here
 * since that ceiling isn't independently confirmed per-model through SIRAYA.
 */
export const MAX_REF_IMAGES = 4;

export type ImageControlValues = Record<string, string | number>;

/** Initial values for a model's controls (only keys with an explicit default). */
export function defaultValues(model: ImageModel): ImageControlValues {
  const out: ImageControlValues = {};
  for (const c of model.controls) {
    if (c.default !== undefined) out[c.key] = c.default;
  }
  return out;
}

/**
 * Assemble the POST /api/images body for a model, keeping only the parameters
 * that model's family accepts and dropping blank optional fields.
 *
 * `modelId` defaults to `model.id` but should be passed explicitly whenever
 * the caller resolved `model` through getImageModel() from a possibly
 * "NSFW-"-prefixed id — that lookup now strips the prefix to find the right
 * catalogue *controls*, but the actual request must still go out under the
 * id the user picked (whichever moderation profile that resolves to on
 * SIRAYA's side), not the safe twin's bare id, or an NSFW selection would
 * silently generate through the moderated model instead.
 */
export function buildImagePayload(
  model: ImageModel,
  prompt: string,
  values: ImageControlValues,
  assetIds: number[] = [],
  modelId: string = model.id
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: modelId,
    prompt,
    response_format: "url",
  };

  if (assetIds.length && supportsRefImages(model)) {
    body.assetIds = assetIds.slice(0, MAX_REF_IMAGES);
  }

  for (const c of model.controls) {
    const raw = values[c.key];

    if (c.kind === "number") {
      if (raw === "" || raw === undefined || raw === null) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      body[c.key] = num;
      continue;
    }

    if (c.kind === "text") {
      const text = String(raw ?? "").trim();
      if (text) body[c.key] = text;
      continue;
    }

    // select
    if (raw !== undefined && raw !== null && raw !== "") body[c.key] = raw;
  }

  if (body.n === undefined) body.n = 1;
  return body;
}
