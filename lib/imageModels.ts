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

const SEEDREAM_CONTROLS: ImageControl[] = [SIZE, COUNT, NEGATIVE, SEED];
const GEMINI_CONTROLS: ImageControl[] = [SIZE, COUNT];
const GPT_IMAGE_CONTROLS: ImageControl[] = [SIZE, QUALITY, BACKGROUND, COMPRESSION, COUNT];

/* ---- the catalogue (order matches the console model grid) ---- */

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "ByteDance-Seedream-4.0",
    name: "ByteDance Seedream 4.0",
    family: "seedream",
    price: "$0.03 / 張",
    blurb: "高性價比的通用文生圖，中文語意表現穩定。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_CONTROLS,
  },
  {
    id: "ByteDance-Seedream-4.5",
    name: "ByteDance Seedream 4.5",
    family: "seedream",
    price: "$0.04 / 張",
    blurb: "4.0 的升級版，細節與構圖更完整。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_CONTROLS,
  },
  {
    id: "Dola-Seedream-5.0-lite",
    name: "Dola Seedream 5.0 lite",
    family: "seedream",
    price: "$0.035 / 張",
    blurb: "第五代輕量版，速度快、成本低。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_CONTROLS,
  },
  {
    id: "Dola-Seedream-5.0-pro",
    name: "Dola Seedream 5.0 pro",
    family: "seedream",
    price: "$0.045 / 張",
    blurb: "生產級視覺創作，質感與提示詞跟隨度最佳。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: SEEDREAM_CONTROLS,
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
    blurb: "Gemini 生圖旗艦，複雜場景與文字排版最穩。",
    tags: ["REASONING", "VISION", "IMAGE GENERATION"],
    controls: GEMINI_CONTROLS,
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    family: "gpt-image",
    price: "$0.04 / 張",
    blurb: "OpenAI 生圖，支援品質檔位與透明背景輸出。",
    tags: ["VISION", "IMAGE GENERATION"],
    controls: GPT_IMAGE_CONTROLS,
  },
];

export function getImageModel(id: string | null | undefined): ImageModel | undefined {
  if (!id) return undefined;
  const lower = id.toLowerCase();
  return (
    IMAGE_MODELS.find((m) => m.id === id) ||
    IMAGE_MODELS.find((m) => m.id.toLowerCase() === lower)
  );
}

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
 */
export function buildImagePayload(
  model: ImageModel,
  prompt: string,
  values: ImageControlValues
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: model.id,
    prompt,
    response_format: "url",
  };

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
