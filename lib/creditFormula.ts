export type Modality = "image" | "video" | "text";
export const VIDEO_RESOLUTION_MULTIPLIER: Record<string, number> = {
  "480p": 1,
  "720p": 2.25,
  "1080p": 5.5,
  "4k": 11,
};

export function resolutionMultiplier(resolution?: string): number {
  return VIDEO_RESOLUTION_MULTIPLIER[(resolution || "480p").toLowerCase()] ?? 1;
}


export function creditCostFromRate(input: {
  modality: Modality;
  credits: number;
  imageCount?: number;
  seconds?: number;
  maxTokens?: number;
  /** video only — "480p" | "720p" | "1080p" | "4k" */
  resolution?: string;
}): number {
  const per = Math.max(0, Math.trunc(input.credits));
  if (input.modality === "image") return Math.max(1, per * Math.max(1, Math.trunc(input.imageCount ?? 1)));
  if (input.modality === "video") {
    const perSecondAtRes = Math.ceil(per * resolutionMultiplier(input.resolution));
    return Math.max(1, perSecondAtRes * Math.max(1, Math.ceil(input.seconds ?? 5)));
  }
  // text: flat per-message credits + a token component
  return Math.max(1, per + Math.ceil((input.maxTokens ?? 1024) / 2000));
}

