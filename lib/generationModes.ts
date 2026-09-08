import { LAYER_DECOMPOSITION_AVAILABLE, LAYER_DECOMPOSITION_UNAVAILABLE_REASON } from "./layerCapability";
/** Public workflow catalogue. Provider IDs stay internal; never infer an API
 * parameter from a marketing screenshot. Verified against the provider's
 * Seedance and Seedream API references on 2026-09-08. */
export type GenerationMode = "freestyle" | "text-to-video" | "image-to-video" | "first-last-frame" | "subject-reference" | "video-edit" | "video-extend" | "universal-reference" | "layer-separation";
export type GenerationKind = "image" | "video";
export interface GenerationModeOption { id: GenerationMode; label: string; enabled: boolean; reason?: string }

const durationReason = "影片自動時長的點數計價尚未開放";
function seedanceFamily(model: string) {
  const id = model.toLowerCase();
  return { modern: /seedance-2\.(0(?:-fast|-mini)?|5)$/.test(id), latest: /seedance-2\.5$/.test(id), legacy: /seedance-1\.(0|5)-pro(?:-fast)?$/.test(id) };
}
export function getGenerationModes(model: string, kind: GenerationKind): GenerationModeOption[] {
  if (kind === "image") {
    const modes: GenerationModeOption[] = [{ id: "universal-reference", label: "通用參考", enabled: true }];
    if (/seedream.*5[.-]0.*pro/i.test(model)) modes.push({ id: "layer-separation", label: "圖層分離", enabled: LAYER_DECOMPOSITION_AVAILABLE, reason: LAYER_DECOMPOSITION_UNAVAILABLE_REASON });
    return modes;
  }
  const { modern, legacy } = seedanceFamily(model);
  if (modern) return [
    { id: "freestyle", label: "自由創作", enabled: true },
    { id: "first-last-frame", label: "首尾幀編輯", enabled: true },
    { id: "subject-reference", label: "主體參考", enabled: true },
    { id: "video-edit", label: "影片編輯", enabled: false, reason: durationReason },
    { id: "video-extend", label: "影片續寫", enabled: false, reason: durationReason },
  ];
  if (legacy) return [
    { id: "text-to-video", label: "文字生影片", enabled: true },
    { id: "image-to-video", label: "圖片生影片", enabled: true },
    ...(/1\.5/.test(model) ? [{ id: "first-last-frame" as const, label: "首尾幀編輯", enabled: true }] : []),
  ];
  // Other model families retain their existing form, rather than inventing
  // reference/editing support that has not been verified for their API.
  return [];
}
export function isGenerationModeSupported(model: string, kind: GenerationKind, mode: string): mode is GenerationMode {
  return getGenerationModes(model, kind).some(option => option.id === mode && option.enabled);
}

export interface GenerationReference { type: "image" | "video" | "audio"; url: string }
export interface VideoModeInput {
  model: string; mode: GenerationMode; prompt: string; imageUrls?: string[];
  references?: GenerationReference[]; seconds?: number; aspectRatio?: string;
}
export interface VideoModePayload {
  prompt: string; image_url?: string;
  frame_images?: { frame_type: "first_frame" | "last_frame"; image_url: string }[];
  input_references?: (GenerationReference & { role: "reference_image" | "reference_video" | "reference_audio" })[];
  seconds?: number; aspect_ratio?: string;
}
/** Pure provider payload builder. URLs must already be resolved and authorized
 * by the server (especially asset:// IDs). This function is not an ownership
 * check. It validates mode exclusivity before any reservation/provider call. */
export function buildVideoModePayload(input: VideoModeInput): VideoModePayload {
  if (!isGenerationModeSupported(input.model, "video", input.mode)) throw new Error("此模型尚未開放所選生成模式");
  const images = input.imageUrls ?? [];
  const refs = input.references ?? [];
  if (images.some(url => typeof url !== "string" || !url.trim()) || refs.some(ref => !["image", "video", "audio"].includes(ref.type) || typeof ref.url !== "string" || !ref.url.trim())) throw new Error("參考素材格式不正確");
  if (images.length && refs.length) throw new Error("首尾幀與多模態參考不可同時使用");
  const out: VideoModePayload = { prompt: input.prompt };
  if (input.seconds !== undefined) out.seconds = input.seconds;
  if (input.aspectRatio !== undefined) out.aspect_ratio = input.aspectRatio;
  const { latest } = seedanceFamily(input.model);
  if (input.mode === "text-to-video") {
    if (images.length || refs.length) throw new Error("文字生影片不接受參考素材");
  } else if (input.mode === "image-to-video") {
    if (images.length !== 1 || refs.length) throw new Error("圖片生影片需要一張圖片");
    out.image_url = images[0];
  } else if (input.mode === "first-last-frame") {
    if (images.length !== 2 || refs.length) throw new Error("首尾幀模式需要首幀與尾幀各一張圖片");
    out.frame_images = [{ frame_type: "first_frame", image_url: images[0] }, { frame_type: "last_frame", image_url: images[1] }];
    if (latest) out.aspect_ratio = "adaptive";
  } else {
    if (images.length) throw new Error("此模式請透過參考素材欄位提供圖片");
    if (input.mode === "subject-reference" && !refs.length) throw new Error("主體參考需要至少一份素材");
    if (refs.length) {
      const counts = { image: 0, video: 0, audio: 0 };
      for (const ref of refs) counts[ref.type]++;
      if (refs.length > (latest ? 50 : 15) || counts.image > (latest ? 30 : 9) || counts.video > (latest ? 10 : 3) || counts.audio > (latest ? 10 : 3)) throw new Error("參考素材數量超過模型上限");
      if (!latest && !counts.image && !counts.video) throw new Error("此模型不支援僅使用音訊參考");
      // Provider requires seconds:-1 whenever a video is present. Do not
      // silently replace a priced duration with unbounded automatic output.
      if (counts.video) throw new Error(durationReason);
      out.input_references = refs.map(ref => ({ ...ref, role: `reference_${ref.type}` }));
    }
  }
  if (out.seconds !== undefined && (!Number.isInteger(out.seconds) || out.seconds < 4 || out.seconds > (latest ? 30 : 15))) throw new Error("生成時長不在模型支援範圍內");
  return out;
}
