import { getKlingVideoModel } from "./klingVideo";
import type { GenSettings } from "./types";

/** Clamp stale editor state when switching models; API requests still validate independently. */
export function normalizeKlingSettings(model: string | null | undefined, settings: GenSettings): GenSettings {
  const caps = getKlingVideoModel(model);
  if (!caps) return settings;
  const resolution = caps.resolutions.find(value => value === settings.resolution) ?? caps.resolutions[0];
  return {
    ...settings,
    resolution,
    seconds: caps.secondsOptions.includes(settings.seconds) ? settings.seconds : caps.secondsOptions[0],
    aspectRatio: caps.aspectRatios.find(value => value === settings.aspectRatio) ?? "16:9",
    generateAudio: caps.nativeAudioOnly || (caps.supportsAudio && caps.nativeAudioResolutions.includes(resolution) && settings.generateAudio !== false),
    promptExtend: false,
  };
}
