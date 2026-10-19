/** BYOK Seedance contract, checked against the SIRAYA Seedance reference.
 * Unlike consumer generation, automatic duration is paid directly by the
 * customer's provider account. No consumer quote or credit fallback applies.
 * All URLs passed to the builder must already be resolved from owned assets.
 */
export type BusinessSeedanceMode = "freestyle" | "text-to-video" | "image-to-video" | "first-last-frame" | "subject-reference" | "video-edit" | "video-extend";
export type SeedanceReferenceType = "image" | "video" | "audio";
export interface BusinessSeedanceCapability {
  id: string;
  version: "2.0" | "2.5";
  resolutions: readonly string[];
  minSeconds: 4;
  maxSeconds: 15 | 30;
  defaultSeconds: 5;
  autoDuration: true;
  aspectRatios: readonly string[];
  references: { total: number; image: number; video: number; audio: number };
  modes: readonly BusinessSeedanceMode[];
  outputFormats: readonly ("mp4" | "mov")[];
}
const MODES: readonly BusinessSeedanceMode[] = ["freestyle", "text-to-video", "image-to-video", "first-last-frame", "subject-reference", "video-edit", "video-extend"];
const ASPECT_RATIOS = ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;

/** Exact recognized aliases only: a guessed model ID never inherits a paid capability. */
export function getSeedanceCapability(modelId: string | null | undefined): BusinessSeedanceCapability | undefined {
  const id = (modelId ?? "").toLowerCase().replace(/^(?:(?:nsfw|siraya)-)+/, "").replace(/^seedance-(2)-(0|5)/, "seedance-$1.$2");
  if (!/^seedance-2\.(?:5|0(?:-fast|-mini)?)$/.test(id)) return undefined;
  const latest = id === "seedance-2.5";
  return {
    id, version: latest ? "2.5" : "2.0",
    resolutions: latest ? ["480p", "720p", "1080p"] : /-(?:fast|mini)$/.test(id) ? ["480p", "720p"] : ["480p", "720p", "1080p", "4k"],
    minSeconds: 4, maxSeconds: latest ? 30 : 15, defaultSeconds: 5, autoDuration: true,
    aspectRatios: ASPECT_RATIOS,
    references: latest ? { total: 50, image: 30, video: 10, audio: 10 } : { total: 15, image: 9, video: 3, audio: 3 },
    modes: MODES, outputFormats: latest ? ["mp4", "mov"] : [],
  };
}
export class BusinessSeedanceParameterError extends Error {
  readonly code = "invalid_parameters";
  constructor() { super("Seedance parameters are incompatible with this mode."); }
}
function bad(): never { throw new BusinessSeedanceParameterError(); }
export interface ResolvedBusinessSeedanceReference { type: SeedanceReferenceType; url: string }

/** Pure count/type/mode validation, before reading private image bytes or reserving a job. */
export function assertBusinessSeedanceReferences(caps: BusinessSeedanceCapability, mode: BusinessSeedanceMode, refs: readonly { type: SeedanceReferenceType }[]): void {
  if (!caps.modes.includes(mode) || refs.length > caps.references.total) bad();
  const counts = { image: 0, video: 0, audio: 0 };
  for (const reference of refs) {
    if (!reference || !["image", "video", "audio"].includes(reference.type)) bad();
    counts[reference.type]++;
  }
  if (Object.entries(counts).some(([type, count]) => count > caps.references[type as SeedanceReferenceType])) bad();
  if (mode === "text-to-video" && refs.length) bad();
  if (mode === "image-to-video" && (refs.length !== 1 || counts.image !== 1)) bad();
  if (mode === "first-last-frame" && (refs.length !== 2 || counts.image !== 2)) bad();
  if (mode === "subject-reference" && !refs.length) bad();
  if ((mode === "subject-reference" || mode === "freestyle") && refs.length && caps.version === "2.0" && !counts.image && !counts.video) bad();
  if ((mode === "video-edit" || mode === "video-extend") && !counts.video) bad();
}

/** Client fields are explicitly rebuilt; arbitrary URLs, callbacks and extra_body never pass through. */
export function buildBusinessSeedancePayload(parameters: Record<string, unknown>, refs: readonly ResolvedBusinessSeedanceReference[]): Record<string, unknown> {
  if (Object.keys(parameters).some(key => !["model", "prompt", "seconds", "resolution", "aspect_ratio", "generate_audio", "seed", "output_format", "mode", "assetIds", "providerAssets", "referenceOrder"].includes(key))) bad();
  const caps = getSeedanceCapability(String(parameters.model));
  if (!caps) bad();
  const mode = (parameters.mode ?? "freestyle") as BusinessSeedanceMode;
  assertBusinessSeedanceReferences(caps, mode, refs);
  if (refs.some(reference => typeof reference.url !== "string" || !reference.url.trim())) bad();
  const seconds = parameters.seconds ?? caps.defaultSeconds;
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || (seconds !== -1 && (seconds < caps.minSeconds || seconds > caps.maxSeconds))) bad();
  // Any video reference uses provider-determined duration. Never silently turn
  // a user's explicit fixed duration into a different billing contract.
  if (refs.some(reference => reference.type === "video") && seconds !== -1) bad();
  const resolution = parameters.resolution ?? "720p";
  if (typeof resolution !== "string" || !caps.resolutions.includes(resolution)) bad();
  const aspect = parameters.aspect_ratio ?? "16:9";
  if (typeof aspect !== "string" || !caps.aspectRatios.includes(aspect)) bad();
  if (typeof parameters.prompt !== "string" || !parameters.prompt.trim() || parameters.prompt.length > 12000) bad();
  const prefix = mode === "video-edit" ? "Video edit: " : mode === "video-extend" ? "Video extension: extend and continue the input video. " : "";
  const prompt = prefix && !parameters.prompt.startsWith(prefix) ? prefix + parameters.prompt : parameters.prompt;
  if (prompt.length > 12000) bad();
  if (parameters.generate_audio !== undefined && typeof parameters.generate_audio !== "boolean") bad();
  if (parameters.seed !== undefined && (typeof parameters.seed !== "number" || !Number.isSafeInteger(parameters.seed) || parameters.seed < -1 || parameters.seed > 2147483647)) bad();
  if (parameters.output_format !== undefined && !caps.outputFormats.includes(parameters.output_format as "mp4" | "mov")) bad();
  const payload: Record<string, unknown> = {
    model: parameters.model, prompt, seconds, resolution, aspect_ratio: aspect, async: true,
  };
  for (const key of ["generate_audio", "seed", "output_format"]) if (parameters[key] !== undefined) payload[key] = parameters[key];
  if (mode === "image-to-video") payload.frame_images = [{ frame_type: "first_frame", image_url: refs[0].url }];
  else if (mode === "first-last-frame") payload.frame_images = refs.map((reference, index) => ({ frame_type: index ? "last_frame" : "first_frame", image_url: reference.url }));
  else if (refs.length) payload.input_references = refs.map(reference => ({ type: reference.type, url: reference.url, role: `reference_${reference.type}` }));
  if (caps.version === "2.5" && ["image-to-video", "first-last-frame", "video-edit", "video-extend"].includes(mode)) payload.aspect_ratio = "adaptive";
  return payload;
}
