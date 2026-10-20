/** Dedicated BYOK video contracts; deliberately independent of C-end billing and adapters.
 * Sources checked 2026-10-20:
 * https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/wan/
 * https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/happyhorse/
 * https://help.aliyun.com/zh/model-studio/wan2-7-r2v
 * Both families use POST /v1/videos/generations and GET /v1/videos/{id}.
 * This module performs no fetch. Its references MUST come from the caller's
 * account-scoped resolver, never from client-provided media URLs.
 */
export type BusinessDedicatedVideoMode = "freestyle" | "text-to-video" | "image-to-video" | "first-last-frame" | "subject-reference" | "video-edit" | "video-extend";
export interface BusinessDedicatedVideoCapability {
  family: "wan2.7" | "happyhorse";
  capability: "text-to-video" | "image-to-video" | "subject-reference" | "video-edit";
  resolutions: string[];
  minSeconds: number;
  maxSeconds: number;
  defaultSeconds: number;
  sourceDuration: boolean;
  aspectRatios: string[];
  aspectRatioFromSource: boolean;
  maxReferenceImages: number;
  maxReferenceVideos: number;
  maxReferenceAudio: number;
  supportsAudio: boolean;
  modes: BusinessDedicatedVideoMode[];
  promptMaxChars: number;
  /** The router also caps all prompts at 5000 characters; CJK text has a 2500-character limit. */
  cjkPromptMaxChars?: number;
  referenceImageRules?: { minSide: number; maxBytes: number; mimeTypes: string[] };
}
const STANDARD_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const HAPPY_RATIOS = [...STANDARD_RATIOS, "4:5", "5:4", "9:21"];
export function getBusinessDedicatedVideoCapability(model: string | null | undefined): BusinessDedicatedVideoCapability | undefined {
  const id = model ?? "";
  const wan = /^wan2\.7-(t2v|i2v|r2v|videoedit)$/.exec(id);
  const happy = /^happyhorse-1\.(0|1)-(t2v|i2v|r2v|video-edit)$/.exec(id);
  if (!wan && !happy) return undefined;
  // SIRAYA explicitly documents no HappyHorse 1.1 editing model.
  if (happy?.[1] === "1" && happy[2] === "video-edit") return undefined;
  const suffix = wan?.[1] ?? happy![2];
  const capability = suffix === "t2v" ? "text-to-video" : suffix === "i2v" ? "image-to-video" : suffix === "r2v" ? "subject-reference" : "video-edit";
  const editing = capability === "video-edit";
  const modes: BusinessDedicatedVideoMode[] = ["freestyle", capability];
  if (wan && capability === "image-to-video") modes.push("first-last-frame", "video-extend");
  return {
    family: wan ? "wan2.7" : "happyhorse", capability,
    resolutions: happy?.[1] === "1" ? ["480p", "720p", "1080p"] : ["720p", "1080p"],
    minSeconds: wan ? 2 : 3, maxSeconds: wan && editing ? 10 : 15,
    defaultSeconds: editing && wan ? 0 : 5, sourceDuration: editing,
    aspectRatios: [...(wan ? STANDARD_RATIOS : HAPPY_RATIOS)],
    aspectRatioFromSource: editing || capability === "image-to-video",
    // Native Wan 2.7 allows five materials. SIRAYA only publishes image
    // reference roles for its r2v model, so video-r2v is not guessed here.
    maxReferenceImages: capability === "subject-reference" ? wan ? 5 : 9 : capability === "image-to-video" ? wan ? 2 : 1 : editing && happy ? 5 : 0,
    maxReferenceVideos: editing || (wan && capability === "image-to-video") ? 1 : 0,
    maxReferenceAudio: wan && ["text-to-video", "image-to-video"].includes(capability) ? 1 : 0,
    supportsAudio: !!wan, modes, promptMaxChars: happy ? 5000 : 12000,
    ...(happy ? { cjkPromptMaxChars: 2500, referenceImageRules: { minSide: 400, maxBytes: 20 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp"] } } : {}),
  };
}
export interface ResolvedBusinessDedicatedVideoReference {
  type: "image" | "video" | "audio";
  url: string;
  /** Only set by an account-scoped server resolver, paired to a reference image. */
  voiceUrl?: string;
}
export class BusinessDedicatedVideoParameterError extends Error {
  readonly code = "invalid_parameters";
  constructor() { super("Video parameters are incompatible with this model."); }
}
function bad(): never { throw new BusinessDedicatedVideoParameterError(); }
const DATA_KEYS = ["assetIds", "businessAssetIds", "providerAssets", "referenceOrder", "mode"];
const COMMON_KEYS = ["model", "prompt", "seconds", "resolution", "aspect_ratio", "seed", "watermark"];
function validResolvedUrl(value: unknown, type: string): boolean {
  if (typeof value !== "string" || !value || value.length > 30 * 1024 * 1024) return false;
  // asset:// is the Seedance trusted-asset contract, not a published Wan or
  // HappyHorse input URL. Resolve an owned upload to its private HTTPS grant.
  if (type === "image" && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}

/** Counts/types are checked before the caller reads any private bytes or reserves a job. */
export function assertBusinessDedicatedVideoReferences(caps: BusinessDedicatedVideoCapability, mode: BusinessDedicatedVideoMode, refs: readonly { type: string; voiceUrl?: string }[]): void {
  if (!caps.modes.includes(mode) || refs.length > 10) bad();
  const images = refs.filter(ref => ref.type === "image").length;
  const videos = refs.filter(ref => ref.type === "video").length;
  const audio = refs.filter(ref => ref.type === "audio").length;
  if (images + videos + audio !== refs.length || images > caps.maxReferenceImages || videos > caps.maxReferenceVideos || audio > caps.maxReferenceAudio) bad();
  if (refs.some(ref => ref.voiceUrl !== undefined && !(caps.family === "wan2.7" && caps.capability === "subject-reference" && ref.type === "image"))) bad();
  if (caps.capability === "text-to-video" && (images || videos)) bad();
  if (caps.capability === "subject-reference" && (!images || videos || audio)) bad();
  if (caps.capability === "video-edit" && (videos !== 1 || audio)) bad();
  if (caps.capability === "image-to-video") {
    if (caps.family === "happyhorse" && (images !== 1 || videos || audio)) bad();
    if (caps.family === "wan2.7") {
      if (videos ? images || audio : !images) bad();
      // Driving audio is documented with a first frame, not with a last frame.
      if (audio && images !== 1) bad();
      if (mode === "first-last-frame" && (images !== 2 || videos || audio)) bad();
      if (mode === "video-extend" && (videos !== 1 || images || audio)) bad();
      if (mode === "image-to-video" && (images !== 1 || videos)) bad();
    }
  }
}

/** Strict reconstruction is intentional: no client URL, passthrough, callback or
 * unknown provider control can bypass the caller's ownership and age checks.
 * UI resolutions remain lowercase; these two provider families require uppercase.
 */
export function buildBusinessDedicatedVideoPayload(parameters: Record<string, unknown>, refs: readonly ResolvedBusinessDedicatedVideoReference[]): Record<string, unknown> {
  const caps = getBusinessDedicatedVideoCapability(typeof parameters.model === "string" ? parameters.model : undefined);
  if (!caps) bad();
  const wan = caps.family === "wan2.7";
  const editing = caps.capability === "video-edit";
  const allowed = [...DATA_KEYS, ...COMMON_KEYS, ...(wan ? ["negative_prompt", "generate_audio", "prompt_extend"] : []), ...(editing ? ["audio_setting"] : [])];
  if (Object.keys(parameters).some(key => !allowed.includes(key))) bad();
  const mode = (parameters.mode ?? "freestyle") as BusinessDedicatedVideoMode;
  assertBusinessDedicatedVideoReferences(caps, mode, refs);
  if (refs.some(ref => !validResolvedUrl(ref.url, ref.type) || (ref.voiceUrl !== undefined && !validResolvedUrl(ref.voiceUrl, "audio")))) bad();
  const prompt = parameters.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > caps.promptMaxChars || (caps.cjkPromptMaxChars && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prompt) && prompt.length > caps.cjkPromptMaxChars)) bad();
  const resolution = parameters.resolution ?? "720p";
  if (typeof resolution !== "string" || !caps.resolutions.includes(resolution)) bad();
  if (parameters.aspect_ratio !== undefined && (typeof parameters.aspect_ratio !== "string" || !caps.aspectRatios.includes(parameters.aspect_ratio))) bad();
  if (parameters.seed !== undefined && (typeof parameters.seed !== "number" || !Number.isSafeInteger(parameters.seed) || parameters.seed < (wan ? -1 : 0) || parameters.seed > 2147483647)) bad();
  for (const key of ["watermark", "generate_audio", "prompt_extend"]) if (parameters[key] !== undefined && typeof parameters[key] !== "boolean") bad();
  if (parameters.negative_prompt !== undefined && (typeof parameters.negative_prompt !== "string" || parameters.negative_prompt.length > 4000)) bad();
  if (parameters.audio_setting !== undefined && !["auto", "origin"].includes(String(parameters.audio_setting))) bad();
  // Editing follows the source, so an unspecified duration is deliberate. HappyHorse
  // rejects the field altogether; Wan explicitly accepts 0 as "keep source length".
  const seconds = parameters.seconds ?? caps.defaultSeconds;
  if (editing && !wan) {
    if (parameters.seconds !== undefined) bad();
  } else if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || (!(wan && editing && seconds === 0) && (seconds < caps.minSeconds || seconds > caps.maxSeconds))) bad();
  const payload: Record<string, unknown> = { model: parameters.model, prompt, resolution: resolution.toUpperCase(), watermark: parameters.watermark ?? false, async: true };
  if (!(editing && !wan)) payload.seconds = seconds;
  if (!caps.aspectRatioFromSource) payload.aspect_ratio = parameters.aspect_ratio ?? "16:9";
  if (parameters.seed !== undefined) payload.seed = parameters.seed;
  if (wan) {
    payload.prompt_extend = parameters.prompt_extend ?? false;
    for (const key of ["negative_prompt", "generate_audio"]) if (parameters[key] !== undefined) payload[key] = parameters[key];
  }
  if (editing) payload.audio_setting = parameters.audio_setting ?? "auto";
  if (caps.capability === "text-to-video") {
    if (refs[0]) payload.audio_url = refs[0].url;
  } else if (caps.capability === "subject-reference") {
    payload.input_references = refs.map(ref => ({ role: "reference_image", url: ref.url, ...(ref.voiceUrl ? { voice_url: ref.voiceUrl } : {}) }));
  } else if (editing) {
    payload.input_references = refs.map(ref => ({ role: ref.type === "video" ? "video" : "reference_image", url: ref.url }));
  } else {
    const images = refs.filter(ref => ref.type === "image");
    if (images.length) payload.frame_images = images.map((ref, index) => ({ frame_type: index ? "last_frame" : "first_frame", image_url: ref.url }));
    const nonImages = refs.filter(ref => ref.type !== "image");
    if (nonImages.length) payload.input_references = nonImages.map(ref => ({ role: ref.type === "audio" ? "driving_audio" : "first_clip", url: ref.url }));
  }
  return payload;
}
