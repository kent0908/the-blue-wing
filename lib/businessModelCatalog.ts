import { getSeedanceCapability } from "./businessSeedance";
import { getBusinessImageCapability } from "./businessImageCapabilities";
import { getBusinessDedicatedVideoCapability } from "./businessDedicatedVideo";
import { videoConstraintFor, maxRefsForVideoModel } from "./videoModels";
import { getKlingVideoModel } from "./klingVideo";
import { getMiniMaxVideoModel } from "./minimaxVideo";
import { isRetiredGenerationModel } from "./generationPickerModels";
import { modelLabel } from "./modelLabel";
import type { BusinessModel } from "./businessGeneration";

export type BusinessCatalogCategory = "image" | "video" | "text" | "audio" | "embedding" | "avatar" | "tool" | "unknown";
export interface BusinessUnavailableModel { id: string; displayName: string; category: BusinessCatalogCategory; reason: "dedicated_tool" | "adapter_pending" | "retired" | "unsupported_model" }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9._:-]{1,150}$/.test(value) && !/^(?:sk|csk)-/i.test(value);
function category(id: string): BusinessCatalogCategory {
  if (/embedding/i.test(id)) return "embedding";
  if (/(?:^|-)(?:asr|tts)(?:-|$)/i.test(id)) return "audio";
  if (/avatar|lip-sync|face-recognition/i.test(id)) return "avatar";
  if (/seedream|gpt-image|gemini.*-image/i.test(id)) return "image";
  if (/seedance|wan\d|happyhorse|kling|veo|sora|hailuo|runway/i.test(id)) return "video";
  const canonical = id.replace(/^(?:(?:NSFW|SIRAYA|uncensored|FW|Dola|ByteDance)-)+/i, "");
  if (/^(?:gpt-\d|claude-(?:opus|sonnet|haiku|fable)-|gemini-\d|deepseek-(?:v|r)\d|grok-\d|glm-\d|qwen\d|kimi-k\d|minimax-m\d|seed-(?:\d|sc))/i.test(canonical)) return "text";
  return "unknown";
}
/** /v1/models has no modality metadata. Only reviewed family contracts become
 * executable; every other granted model remains visible as an explicit tool.
 * No C-end credit rates, active retail flags, platform keys or alias rewrites.
 */
export function buildBusinessModelCatalog(raw: unknown) {
  if (!record(raw) || !Array.isArray(raw.data) || raw.data.length > 5000) throw new Error("invalid_provider_catalog");
  const seen = new Set<string>();
  const models: BusinessModel[] = [];
  const unavailableModels: BusinessUnavailableModel[] = [];
  for (const entry of raw.data) {
    if (!record(entry) || !safeId(entry.id) || seen.has(entry.id.toLowerCase())) continue;
    const id = entry.id;
    seen.add(id.toLowerCase());
    const common = { id, displayName: modelLabel(id), nsfw: /(?:^|-)(?:nsfw|uncensored)(?:-|$)/i.test(id) };
    const kind = category(id);
    const unavailable = (reason: BusinessUnavailableModel["reason"]) => unavailableModels.push({ id, displayName: common.displayName, category: kind, reason });
    if (isRetiredGenerationModel(id)) { unavailable("retired"); continue; }
    if (["audio", "embedding", "avatar", "tool"].includes(kind)) { unavailable("dedicated_tool"); continue; }
    const image = getBusinessImageCapability(id);
    if (image) {
      models.push({ ...common, modality: "image", supportsReferences: true, sizes: image.sizes, maxReferenceImages: image.maxReferenceImages, maxImageCount: image.maxImageCount, imageControls: image.controls }); continue;
    }
    const seedance = getSeedanceCapability(id);
    if (seedance) {
      models.push({ ...common, modality: "video", supportsReferences: true, resolutions: [...seedance.resolutions], minSeconds: seedance.minSeconds, maxSeconds: seedance.maxSeconds, defaultSeconds: seedance.defaultSeconds, aspectRatios: [...seedance.aspectRatios], supportsAudio: true, maxReferenceImages: seedance.references.image, seedance }); continue;
    }
    const dedicatedVideo = getBusinessDedicatedVideoCapability(id);
    // Source-video grants need their own resolver before editing can be enabled.
    if (dedicatedVideo && dedicatedVideo.capability !== "video-edit") {
      models.push({ ...common, modality: "video", supportsReferences: dedicatedVideo.maxReferenceImages > 0,
        resolutions: [...dedicatedVideo.resolutions], minSeconds: dedicatedVideo.minSeconds, maxSeconds: dedicatedVideo.maxSeconds,
        defaultSeconds: dedicatedVideo.defaultSeconds, aspectRatios: [...dedicatedVideo.aspectRatios], supportsAudio: dedicatedVideo.supportsAudio,
        maxReferenceImages: dedicatedVideo.maxReferenceImages, promptMaxChars: dedicatedVideo.promptMaxChars, dedicatedVideo }); continue;
    }
    const kling = getKlingVideoModel(id);
    if (kling) {
      models.push({ ...common, modality: "video", supportsReferences: true, ...videoConstraintFor(id), aspectRatios: [...kling.aspectRatios], supportsAudio: kling.supportsAudio, nativeAudioOnly: kling.nativeAudioOnly, nativeAudioResolutions: [...kling.nativeAudioResolutions], defaultSeconds: 5, secondsOptions: [...kling.secondsOptions], maxReferenceImages: kling.maxReferenceImages, promptMaxChars: 2500 }); continue;
    }
    const minimax = getMiniMaxVideoModel(id);
    if (minimax) {
      models.push({ ...common, modality: "video", supportsReferences: true, ...videoConstraintFor(id), aspectRatios: [...minimax.aspectRatios], supportsAudio: true, nativeAudioOnly: true, nativeAudioResolutions: [...minimax.nativeAudioResolutions], defaultSeconds: minimax.defaultSeconds, maxReferenceImages: 9 }); continue;
    }
    if (/^(?:veo-3\.1-generate-001|wan3\.0-video(?:-prime)?|(?:(?:NSFW|SIRAYA)-)*(?:ByteDance-)?Seedance-1\.(?:0|5)-pro(?:-fast)?)$/i.test(id)) {
      const caps = videoConstraintFor(id.replace(/^NSFW-/i, ""));
      if (caps.resolutions.length) {
        const veo = /^veo/i.test(id);
        models.push({ ...common, modality: "video", ...caps, supportsReferences: maxRefsForVideoModel(id) > 0, aspectRatios: veo ? ["16:9", "9:16"] : ["16:9", "9:16", "1:1"], supportsAudio: veo || /^wan3/i.test(id), defaultSeconds: veo ? 8 : 5, maxReferenceImages: 4, ...(veo ? { secondsOptions: [4, 6, 8] } : {}) }); continue;
      }
    }
    if (kind === "text") { models.push({ ...common, modality: "text", supportsReferences: false }); continue; }
    unavailable(kind === "unknown" ? "unsupported_model" : "adapter_pending");
  }
  // The upstream grant list is unordered and can change on every request.
  // Keep the catalogue stable and never place an adult alias before normal models.
  models.sort((a, b) => Number(a.nsfw) - Number(b.nsfw) || a.displayName.localeCompare(b.displayName, "en") || a.id.localeCompare(b.id, "en"));
  unavailableModels.sort((a, b) => a.displayName.localeCompare(b.displayName, "en") || a.id.localeCompare(b.id, "en"));
  return { models, unavailableModels, upstreamTotal: seen.size };
}
