/** SIRAYA's Wan 3.0 endpoint contract, separate from the legacy Wan adapter.
 * https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/wan/
 *
 * Only pass URLs from the account-scoped image and video resolvers.
 */
const MODELS = {
  "wan3.0-video": { label: "Wan 3.0", pro: false },
  "wan3.0-video-pro": { label: "Wan 3.0 Pro", pro: true },
  "wan3.0-video-prime": { label: "Wan 3.0 Prime", pro: false },
  "wan3.0-video-prime-pro": { label: "Wan 3.0 Prime Pro", pro: true },
  "wan3.0-video-spicy": { label: "Wan 3.0 Spicy", pro: false },
  "wan3.0-video-pro-spicy": { label: "Wan 3.0 Pro Spicy", pro: true },
  "wan3.0-video-prime-spicy": { label: "Wan 3.0 Prime Spicy", pro: false },
  "wan3.0-video-prime-pro-spicy": { label: "Wan 3.0 Prime Pro Spicy", pro: true },
} as const;

const WAN3_MODES = ["freestyle", "text-to-video", "image-to-video", "first-last-frame", "subject-reference"] as const;
type Wan3Id = keyof typeof MODELS;
export type BusinessWan3Mode = typeof WAN3_MODES[number];
const RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"];
const MAX_IMAGES = 10;
export const WAN3_MAX_REFERENCE_VIDEOS = 5;
export const WAN3_MAX_REFERENCE_SECONDS = 15;
export const WAN3_REFERENCE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const WAN3_REFERENCE_VIDEO_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  "video/mp4": "mp4",
  "video/quicktime": "mov",
});

export function wan3ReferenceVideoExtension(mime: string | undefined): string | undefined {
  return mime && Object.hasOwn(WAN3_REFERENCE_VIDEO_EXTENSIONS, mime) ? WAN3_REFERENCE_VIDEO_EXTENSIONS[mime] : undefined;
}
const MAX_PROMPT = 2000;
const COMMON_KEYS = new Set(["model", "prompt", "seconds", "resolution", "aspect_ratio", "seed", "generate_audio", "prompt_extend", "mode", "businessAssetIds", "referenceGenerationIds"]);

function isWan3Id(value: unknown): value is Wan3Id {
  return typeof value === "string" && Object.hasOwn(MODELS, value);
}

export function isBusinessWan3SpicyModel(value: unknown): value is Wan3Id {
  return isWan3Id(value) && value.endsWith("-spicy");
}

export function getBusinessWan3Capability(model: string | null | undefined) {
  if (!isWan3Id(model)) return undefined;
  const { label, pro } = MODELS[model];
  return {
    family: "wan3.0" as const, capability: "text-to-video" as const, label,
    resolutions: pro ? ["1080p", "2k", "4k"] : ["480p", "720p", "1080p"], defaultResolution: "1080p",
    minSeconds: 2, maxSeconds: 30, defaultSeconds: 5, sourceDuration: false, autoDuration: true,
    aspectRatios: [...RATIOS], aspectRatioFromSource: false,
    maxReferenceImages: MAX_IMAGES, maxReferenceVideos: WAN3_MAX_REFERENCE_VIDEOS, maxReferenceAudio: 0,
    acceptsReferenceOrder: true, supportsPersonalReferences: true,
    supportsAudio: true, modes: [...WAN3_MODES], promptMaxChars: MAX_PROMPT,
    // Use the intersection with the app's inspected image formats.
    referenceImageRules: {
      minSide: 240, maxBytes: 20 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      minAspectRatio: 1 / 8, maxAspectRatio: 8, opaquePng: true,
    },
  };
}

export type BusinessWan3Capability = NonNullable<ReturnType<typeof getBusinessWan3Capability>>;
interface RefType { type: string; voiceUrl?: string; duration?: number }
interface ResolvedReference extends RefType { url: string }

export class BusinessWan3ParameterError extends Error {
  readonly code = "invalid_parameters";
  constructor() { super("Video parameters are incompatible with Wan 3.0."); }
}
function bad(): never { throw new BusinessWan3ParameterError(); }

export function assertBusinessWan3References(mode: unknown, refs: readonly RefType[]): void {
  if (!Array.isArray(refs) || refs.length > MAX_IMAGES + WAN3_MAX_REFERENCE_VIDEOS) bad();
  for (const ref of refs) if (!ref || !["image", "video"].includes(ref.type) || ref.voiceUrl !== undefined) bad();
  const videos = refs.filter(ref => ref.type === "video").length;
  if (videos > WAN3_MAX_REFERENCE_VIDEOS || refs.length - videos > MAX_IMAGES) bad();
  const effective = mode === undefined || mode === "freestyle" ? (refs.length ? "subject-reference" : "text-to-video") : mode;
  if (effective === "text-to-video" && refs.length === 0) return;
  if (effective === "image-to-video" && refs.length === 1 && videos === 0) return;
  if (effective === "first-last-frame" && refs.length === 2 && videos === 0) return;
  if (effective === "subject-reference" && refs.length > 0) return;
  bad();
}

function validResolvedUrl(value: unknown): value is string {
  // Wan fetches the HTTPS media URL itself. Do not inline large data URLs or
  // forward provider asset handles, unowned URLs in parameters or URL auth.
  if (typeof value !== "string" || !value.startsWith("https://") || value.length > 8192 || /[\x00-\x20\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

/** Reconstruct the flat JSON envelope; never inherit a caller's extra fields. */
export function buildBusinessWan3Payload(parameters: Record<string, unknown>, refs: readonly ResolvedReference[]): Record<string, unknown> {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters) ||
    !isWan3Id(parameters.model) || Object.keys(parameters).some(key => !COMMON_KEYS.has(key))) bad();
  const caps = getBusinessWan3Capability(parameters.model)!;
  const mode = parameters.mode;
  assertBusinessWan3References(mode, refs);
  if (refs.some(ref => !validResolvedUrl(ref.url))) bad();

  const prompt = parameters.prompt;
  if (prompt !== undefined && (typeof prompt !== "string" || prompt.length > MAX_PROMPT)) bad();
  if (!refs.length && (typeof prompt !== "string" || !prompt.trim())) bad();
  const seconds = parameters.seconds === undefined ? caps.defaultSeconds : parameters.seconds;
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) ||
    (seconds !== -1 && (seconds < caps.minSeconds || seconds > caps.maxSeconds))) bad();
  const clips = refs.filter(ref => ref.type === "video" && ref.duration !== undefined);
  if (clips.some(({ duration }) => !Number.isFinite(duration) || duration! < 1 || duration! > WAN3_MAX_REFERENCE_SECONDS)) bad();
  const inputSeconds = clips.reduce((sum, clip) => sum + clip.duration!, 0);
  if (inputSeconds > WAN3_MAX_REFERENCE_SECONDS || (seconds !== -1 && inputSeconds + seconds > 30)) bad();
  const resolution = parameters.resolution === undefined ? caps.defaultResolution : parameters.resolution;
  if (typeof resolution !== "string" || !caps.resolutions.includes(resolution)) bad();
  const isFrameMode = mode === "image-to-video" || mode === "first-last-frame";
  const aspectRatio = parameters.aspect_ratio === undefined ? isFrameMode ? "adaptive" : "16:9" : parameters.aspect_ratio;
  if (typeof aspectRatio !== "string" || !RATIOS.includes(aspectRatio) || (aspectRatio === "adaptive" && !refs.length)) bad();
  const seed = parameters.seed;
  if (seed !== undefined && (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) bad();
  for (const key of ["generate_audio", "prompt_extend"]) {
    if (parameters[key] !== undefined && typeof parameters[key] !== "boolean") bad();
  }

  const payload: Record<string, unknown> = {
    model: parameters.model, seconds, resolution, aspect_ratio: aspectRatio, async: true,
    generate_audio: parameters.generate_audio ?? true, prompt_extend: parameters.prompt_extend ?? false,
  };
  if (typeof prompt === "string" && prompt.trim()) payload.prompt = prompt;
  if (seed !== undefined) payload.seed = seed;
  if (isFrameMode) {
    payload.first_frame = refs[0].url;
    if (mode === "first-last-frame") payload.last_frame = refs[1].url;
  } else if (refs.length) {
    const images = refs.filter(ref => ref.type === "image");
    const videos = refs.filter(ref => ref.type === "video");
    if (images.length) payload.reference_images = images.map(ref => ref.url);
    if (videos.length) payload.reference_videos = videos.map(ref => ref.url);
  }
  return payload;
}
