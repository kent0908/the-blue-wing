/** MiniMax H3 contract, checked 2026-10-19 against SIRAYA's own reference.
 * https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/minimax-h3/
 * The app keeps resolution IDs lowercase; only this adapter sends the required uppercase wire values.
 * Reference video/audio inputs remain disabled until their input cost is measured server-side.
 */
export interface MiniMaxVideoModel {
  id: "minimax-h3" | "minimax-h3-max";
  resolutions: readonly ("480p" | "768p" | "2k")[];
  minSeconds: number; maxSeconds: 15; defaultSeconds: number;
  supportsAudio: true; nativeAudioOnly: true; nativeAudioResolutions: readonly string[];
  supportsReferences: true; maxReferenceImages: 9;
  /** Consumer quote excludes extra input-image fees; free allowance is enforced before reserving credits. */
  includedImageReferences: number;
  aspectRatios: readonly ["16:9", "9:16", "4:3", "1:1", "3:4", "21:9"];
}
export const MINIMAX_VIDEO_MODELS: readonly MiniMaxVideoModel[] = [
  { id: "minimax-h3", resolutions: ["768p", "2k"], minSeconds: 4, maxSeconds: 15, defaultSeconds: 4, supportsAudio: true, nativeAudioOnly: true, nativeAudioResolutions: ["768p", "2k"], supportsReferences: true, maxReferenceImages: 9, includedImageReferences: 5, aspectRatios: ["16:9", "9:16", "4:3", "1:1", "3:4", "21:9"] },
  { id: "minimax-h3-max", resolutions: ["480p", "768p"], minSeconds: 5, maxSeconds: 15, defaultSeconds: 5, supportsAudio: true, nativeAudioOnly: true, nativeAudioResolutions: ["480p", "768p"], supportsReferences: true, maxReferenceImages: 9, includedImageReferences: 2, aspectRatios: ["16:9", "9:16", "4:3", "1:1", "3:4", "21:9"] },
];
export function getMiniMaxVideoModel(id: string | null | undefined): MiniMaxVideoModel | undefined {
  return MINIMAX_VIDEO_MODELS.find(model => model.id === id?.toLowerCase());
}
export class MiniMaxVideoParameterError extends Error {
  readonly status = 400;
  readonly code = "invalid_minimax_parameters";
  constructor() { super("MiniMax H3 parameters are incompatible with this model."); }
}
function bad(): never { throw new MiniMaxVideoParameterError(); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && !!value.trim(); }

/** Validates only options the app can actually honor. Ignored provider fields are not fake controls. */
export function assertMiniMaxVideoParameters(body: Record<string, unknown>): void {
  const model = getMiniMaxVideoModel(String(body.model));
  if (!model) bad();
  const seconds = body.seconds ?? model.defaultSeconds;
  const resolution = body.resolution ?? model.resolutions[0];
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds < model.minSeconds || seconds > model.maxSeconds || typeof resolution !== "string" || !model.resolutions.some(value => value === resolution)) bad();
  if (!nonEmpty(body.prompt) || body.prompt.length > 12000) bad();
  if (body.aspect_ratio !== undefined && !model.aspectRatios.some(value => value === body.aspect_ratio)) bad();
  if (body.generate_audio !== undefined && body.generate_audio !== true) bad();
  if (body.seed !== undefined || body.negative_prompt !== undefined || body.prompt_extend !== undefined || body.draft === true || body.extra_body !== undefined) bad();
}

/** Whitelisted SIRAYA payload: no duration/audio/seed/negative fields or arbitrary provider passthrough. */
export function minimaxVideoPayload<T extends { model: string }>(body: T): T {
  if (!/^(?:(?:NSFW|SIRAYA)-)*minimax-h3(?:-|$)/i.test(body.model)) return body;
  const source = body as T & Record<string, unknown>;
  assertMiniMaxVideoParameters(source);
  const model = getMiniMaxVideoModel(body.model)!;
  const allowed = ["model", "prompt", "seconds", "resolution", "aspect_ratio", "generate_audio", "async", "image_url", "frame_images", "input_references"];
  if (Object.keys(source).some(key => !allowed.includes(key))) bad();
  if (source.async !== undefined && typeof source.async !== "boolean") bad();
  const groups = [source.image_url !== undefined, source.frame_images !== undefined, source.input_references !== undefined].filter(Boolean).length;
  if (groups > 1) bad();
  const frames: { frame_type: "first_frame" | "last_frame"; image_url: string }[] = [];
  if (source.image_url !== undefined) {
    if (!nonEmpty(source.image_url)) bad();
    frames.push({ frame_type: "first_frame", image_url: source.image_url });
  }
  if (source.frame_images !== undefined) {
    if (!Array.isArray(source.frame_images) || source.frame_images.length < 1 || source.frame_images.length > 2) bad();
    const seen = new Set();
    for (const frame of source.frame_images) {
      if (!object(frame) || Object.keys(frame).some(key => !["frame_type", "image_url"].includes(key)) || !["first_frame", "last_frame"].includes(String(frame.frame_type)) || seen.has(frame.frame_type) || !nonEmpty(frame.image_url)) bad();
      seen.add(frame.frame_type);
      frames.push({ frame_type: frame.frame_type as "first_frame" | "last_frame", image_url: frame.image_url });
    }
  }
  const refs: { type: "image"; url: string }[] = [];
  if (source.input_references !== undefined) {
    if (!Array.isArray(source.input_references) || source.input_references.length < 1 || source.input_references.length > model.maxReferenceImages) bad();
    for (const ref of source.input_references) {
      if (!object(ref) || Object.keys(ref).some(key => !["type", "url", "role"].includes(key)) || ref.type !== "image" || !nonEmpty(ref.url)) bad();
      refs.push({ type: "image", url: ref.url });
    }
  }
  const out: Record<string, unknown> = { model: model.id, prompt: source.prompt, seconds: source.seconds ?? model.defaultSeconds, resolution: String(source.resolution ?? model.resolutions[0]).toUpperCase(), ...(frames.length ? { frame_images: frames } : { aspect_ratio: source.aspect_ratio ?? "16:9" }) };
  if (refs.length) out.input_references = refs;
  if (source.async !== undefined) out.async = source.async;
  return out as T;
}
