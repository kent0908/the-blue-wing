/** SIRAYA Kling contract, checked 2026-10-19.
 * https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/kling/
 * Site intentionally offers only 5/10 seconds until per-model 3–15s limits are verified.
 * Source-duration motion/base-video modes stay disabled until duration is measured server-side.
 */
export interface KlingVideoModel {
  id: string;
  resolutions: readonly ("720p" | "1080p" | "4k")[];
  minSeconds: 5; maxSeconds: 10; secondsOptions: readonly number[];
  supportsAudio: boolean; nativeAudioOnly: boolean; nativeAudioResolutions: readonly string[];
  supportsReferences: true; maxReferenceImages: number; omni: boolean; motion: boolean;
  aspectRatios: readonly ["16:9", "9:16", "1:1"];
}
const definitions = [
  { id: "kling-2.5-turbo", resolutions: ["720p", "1080p"], supportsAudio: false, nativeAudioOnly: false, nativeAudioResolutions: [], omni: false, motion: false },
  { id: "kling-2.6", resolutions: ["720p", "1080p"], supportsAudio: true, nativeAudioOnly: false, nativeAudioResolutions: ["1080p"], omni: false, motion: true },
  { id: "kling-3.0", resolutions: ["720p", "1080p", "4k"], supportsAudio: true, nativeAudioOnly: false, nativeAudioResolutions: ["720p", "1080p", "4k"], omni: false, motion: true },
  { id: "kling-3.0-turbo", resolutions: ["720p", "1080p"], supportsAudio: true, nativeAudioOnly: true, nativeAudioResolutions: ["720p", "1080p"], omni: false, motion: false },
  { id: "kling-3.0-omni", resolutions: ["720p", "1080p", "4k"], supportsAudio: true, nativeAudioOnly: false, nativeAudioResolutions: ["720p", "1080p", "4k"], omni: true, motion: false },
  { id: "kling-o1", resolutions: ["720p", "1080p"], supportsAudio: false, nativeAudioOnly: false, nativeAudioResolutions: [], omni: true, motion: false },
] as const;
export const KLING_VIDEO_MODELS: readonly KlingVideoModel[] = definitions.map(model => ({ ...model, minSeconds: 5, maxSeconds: 10, secondsOptions: [5, 10], supportsReferences: true, maxReferenceImages: model.omni ? 4 : 1, aspectRatios: ["16:9", "9:16", "1:1"] }));
export function getKlingVideoModel(id: string | null | undefined): KlingVideoModel | undefined {
  return KLING_VIDEO_MODELS.find(model => model.id === id?.toLowerCase());
}
export class KlingVideoParameterError extends Error {
  readonly status = 400;
  readonly code = "invalid_kling_parameters";
  constructor() { super("Kling parameters are incompatible with this model."); }
}
function bad(): never { throw new KlingVideoParameterError(); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }

/** Shared UI/API constraints. Does not inspect caller ownership; routes resolve all materials first. */
export function assertKlingVideoParameters(body: Record<string, unknown>): void {
  const caps = getKlingVideoModel(String(body.model));
  if (!caps) bad();
  const seconds = body.seconds ?? 5;
  const resolution = body.resolution ?? "720p";
  if (typeof seconds !== "number" || !caps.secondsOptions.includes(seconds) || typeof resolution !== "string" || !caps.resolutions.some(value => value === resolution)) bad();
  if (body.aspect_ratio !== undefined && !caps.aspectRatios.some(value => value === body.aspect_ratio)) bad();
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 2500) bad();
  if (body.generate_audio !== undefined && typeof body.generate_audio !== "boolean") bad();
  if (body.generate_audio === true && (!caps.supportsAudio || !caps.nativeAudioResolutions.includes(resolution))) bad();
  if (body.generate_audio === false && caps.nativeAudioOnly) bad();
  if (body.negative_prompt !== undefined || body.prompt_extend !== undefined || body.draft === true) bad();
}

/** Translate the site's priced seconds/boolean-audio contract into Kling's duration/audio/contents. */
export function klingVideoPayload<T extends { model: string }>(body: T): T {
  if (!/^(?:(?:NSFW|SIRAYA)-)*kling(?:-|$)/i.test(body.model)) return body;
  const source = body as T & Record<string, unknown>;
  assertKlingVideoParameters(source);
  const caps = getKlingVideoModel(body.model)!;
  const allowed = ["model", "prompt", "seconds", "resolution", "aspect_ratio", "generate_audio", "seed", "async", "image_url", "frame_images", "input_references", "extra_body"];
  if (Object.keys(source).some(key => !allowed.includes(key))) bad();
  if (source.seed !== undefined && (typeof source.seed !== "number" || !Number.isSafeInteger(source.seed))) bad();
  if (source.async !== undefined && typeof source.async !== "boolean") bad();
  if (source.extra_body !== undefined && (!object(source.extra_body) || Object.keys(source.extra_body).some(key => key !== "watermark") || (source.extra_body.watermark !== undefined && typeof source.extra_body.watermark !== "boolean"))) bad();
  const contents: { type: "first_frame" | "last_frame" | "refer_image"; url: string }[] = [];
  const materialGroups = [source.image_url !== undefined, source.frame_images !== undefined, source.input_references !== undefined].filter(Boolean).length;
  if (materialGroups > 1) bad();
  if (source.image_url !== undefined) {
    if (typeof source.image_url !== "string" || !source.image_url.trim()) bad();
    contents.push({ type: "first_frame", url: source.image_url });
  }
  if (source.frame_images !== undefined) {
    if (!Array.isArray(source.frame_images) || source.frame_images.length < 1 || source.frame_images.length > 2) bad();
    for (const [index, frame] of source.frame_images.entries()) {
      if (!object(frame) || Object.keys(frame).some(key => !["frame_type", "image_url"].includes(key)) || frame.frame_type !== (index === 0 ? "first_frame" : "last_frame") || typeof frame.image_url !== "string" || !frame.image_url.trim()) bad();
      contents.push({ type: frame.frame_type as "first_frame" | "last_frame", url: frame.image_url });
    }
  }
  if (source.input_references !== undefined) {
    if (!Array.isArray(source.input_references) || source.input_references.length > caps.maxReferenceImages) bad();
    for (const ref of source.input_references) {
      if (!object(ref) || ref.type !== "image" || typeof ref.url !== "string" || !ref.url.trim() || Object.keys(ref).some(key => !["type", "url", "role"].includes(key))) bad();
      contents.push({ type: caps.omni ? "refer_image" : "first_frame", url: ref.url });
    }
  }
  const native = caps.nativeAudioOnly || source.generate_audio === true;
  const out: Record<string, unknown> = { model: caps.id, prompt: source.prompt, duration: source.seconds ?? 5, resolution: source.resolution ?? "720p", aspect_ratio: source.aspect_ratio ?? "16:9", watermark_info: { enabled: object(source.extra_body) && source.extra_body.watermark === true } };
  if (caps.id !== "kling-2.5-turbo") out.audio = native ? "native" : "off";
  if (contents.length) out.contents = contents;
  if (source.seed !== undefined) out.seed = source.seed;
  if (source.async !== undefined) out.async = source.async;
  return out as T;
}
