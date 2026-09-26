export type Modality = "image" | "video" | "text" | "speech";
/** speech: characters of spoken text per billing unit (lib/speechText.ts owns the same constant). */
const SPEECH_CHARS_PER_UNIT = 40;
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
  /** speech only — characters of spoken text (after lib/speechText.ts strips it) */
  speechChars?: number;
  /** video only — "480p" | "720p" | "1080p" | "4k" */
  resolution?: string;
}): number {
  const per = Math.max(0, Math.trunc(input.credits));
  if (input.modality === "image") return Math.max(1, per * Math.max(1, Math.trunc(input.imageCount ?? 1)));
  if (input.modality === "video") {
    const perSecondAtRes = Math.ceil(per * resolutionMultiplier(input.resolution));
    return Math.max(1, perSecondAtRes * Math.max(1, Math.ceil(input.seconds ?? 5)));
  }
  if (input.modality === "speech") {
    // Billed on the characters actually sent to the voice model, so the cost
    // can be quoted on the play button before the call is made.
    return Math.max(1, per * Math.max(1, Math.ceil((input.speechChars ?? 0) / SPEECH_CHARS_PER_UNIT)));
  }
  // text: flat per-message credits + a token component
  return Math.max(1, per + Math.ceil((input.maxTokens ?? 1024) / 2000));
}

