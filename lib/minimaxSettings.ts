import { getMiniMaxVideoModel } from "./minimaxVideo";
import type { GenSettings } from "./types";

/** Editor-side normalization only; server validation remains strict before billing. */
export function normalizeMiniMaxSettings(model: string | null | undefined, settings: GenSettings): GenSettings {
  const caps = getMiniMaxVideoModel(model);
  if (!caps) return settings;
  return {
    ...settings,
    resolution: caps.resolutions.find(value => value.toLowerCase() === settings.resolution.toLowerCase()) ?? caps.resolutions[0],
    seconds: Number.isSafeInteger(settings.seconds) ? Math.max(caps.minSeconds, Math.min(caps.maxSeconds, settings.seconds)) : caps.defaultSeconds,
    aspectRatio: caps.aspectRatios.find(value => value === settings.aspectRatio) ?? "16:9",
    generateAudio: true,
    promptExtend: false,
  };
}
