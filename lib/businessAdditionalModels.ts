/**
 * Display metadata for exact SIRAYA model grants. A grant says the provider
 * lists the ID for this credential; it does not establish a generation
 * request contract. Do not use this map as an execution allowlist.
 */
export interface BusinessAdditionalModel {
  readonly displayName: string;
  readonly category: "video" | "image" | "tool";
  readonly nsfw: boolean;
}

const ADDITIONAL_MODELS = {
  "gemini-omni-1.1-flash-preview": { displayName: "Gemini Omni 1.1 Flash Preview", category: "video", nsfw: false },
  "z-image-spicy": { displayName: "Z-Image Spicy", category: "image", nsfw: true },
  "qwen-image-edit-spicy": { displayName: "Qwen Image Edit Spicy", category: "image", nsfw: true },
  "face-swap-spicy": { displayName: "Face Swap Spicy", category: "tool", nsfw: true },
  "head-swap-spicy": { displayName: "Head Swap Spicy", category: "tool", nsfw: true },
  "wan2.2-i2v-spicy": { displayName: "Wan 2.2 I2V Spicy", category: "video", nsfw: true },
  "wan2.7-i2v-spicy": { displayName: "Wan 2.7 I2V Spicy", category: "video", nsfw: true },
  "wan3.0-video-spicy": { displayName: "Wan 3.0 Spicy", category: "video", nsfw: true },
  "wan3.0-video-prime-spicy": { displayName: "Wan 3.0 Prime Spicy", category: "video", nsfw: true },
  "wan3.0-video-pro-spicy": { displayName: "Wan 3.0 Pro Spicy", category: "video", nsfw: true },
  "wan3.0-video-prime-pro-spicy": { displayName: "Wan 3.0 Prime Pro Spicy", category: "video", nsfw: true },
} as const satisfies Record<string, BusinessAdditionalModel>;

export function getBusinessAdditionalModel(id: unknown): BusinessAdditionalModel | undefined {
  if (typeof id !== "string" || !Object.hasOwn(ADDITIONAL_MODELS, id)) return undefined;
  return ADDITIONAL_MODELS[id as keyof typeof ADDITIONAL_MODELS];
}
