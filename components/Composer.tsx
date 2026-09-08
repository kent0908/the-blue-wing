"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import GenerationModePanel from "./GenerationModePanel";
import FrameUploadCards from "./FrameUploadCards";
import { orderedFrameIds, type FrameSnapshot } from "@/lib/frameSlots";
import { getGenerationModes } from "@/lib/generationModes";
import { modelLabel } from "@/lib/modelLabel";

import { useEffect, useMemo, useRef, useState } from "react";
import Popover from "./Popover";
import SettingsPopover from "./SettingsPopover";
import {
  IconChevronDown,
  IconModel,
  IconVideo,
  IconImage,
  IconAudio,
  IconAvatar,
  IconExpand,
  IconCheck,
  IconPlus,
  IconSparkle,
} from "./Icons";
import { DEFAULT_SETTINGS, MODE_LABELS, type GenSettings, type Mode, type ModelInfo } from "@/lib/types";
import { estimateCost, formatUSD, creditsFromRateCard, type RateCardEntry } from "@/lib/pricing";
import ImageParams from "./ImageParams";
import AdvancedParams from "./AdvancedParams";
import {
  IMAGE_MODELS,
  getImageModel,
  getImageModelForControls,
  defaultValues,
  buildImagePayload,
  supportsRefImages,
  MAX_REF_IMAGES,
  type ImageControlValues,
} from "@/lib/imageModels";
import { normalizeVideoResolution, maxRefsForVideoModel, supportsVideoRefInput, videoConstraintFor } from "@/lib/videoModels";
import { supportsImageWatermark, supportsVideoWatermark } from "@/lib/watermark";
import { AUDIO_MODELS } from "@/lib/audioModels";
import ModelFunctionMenu from "./ModelFunctionMenu";
import { modelFunctionSelection } from "@/lib/modelFunctionSelection";

interface RefAsset {
  id: number;
  src: string;
  name: string;
}

/** @mention token for an asset name — no spaces/@'s so it has an unambiguous
 *  end boundary when typed inline in the prompt. */
function mentionTagFor(name: string): string {
  return name.replace(/\s+/g, "_").replace(/@/g, "") || "asset";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "多輪對話" (text mode) removed from the switcher — still a valid Mode value
// under the hood (語音生成 shares its "text" modality/chat-completions
// fallback — see modalityForMode below — and ResultItem.kind reuses "text"
// for audio results too), just no longer reachable from the UI.
const MODE_ITEMS: { id: Mode; label: string; icon: (p: { className?: string }) => React.ReactElement }[] = [
  { id: "image", label: "智慧生圖", icon: IconImage },
  { id: "video", label: "智慧影片", icon: IconVideo },
  { id: "audio", label: "文字創作", icon: IconAudio },
];

const PLACEHOLDER: Record<Mode, string> = {
  video: "描述你想生成的影片畫面",
  image: "描述你想生成的圖片畫面",
  text: "輸入你的問題或指令",
  audio: "輸入你想撰寫、改寫或討論的內容",
};

/** Credits shown on the submit pill — 1 credit ≈ US$0.005, matching the
 *  order of magnitude of a short 480p clip. Purely a display convention. */

export default function Composer({
  mode,
  onModeChange,
  onSubmit,
  busy,
  initialModel,
  initialPrompt,
  initialImgValues,
  initialRefs,
  initialVideoRef,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSubmit: (args: {
    prompt: string;
    model: string;
    settings: GenSettings;
    imagePayload?: Record<string, unknown>;
    /** selected 素材 asset ids — video mode only (image mode folds these into imagePayload) */
    assetIds?: number[];
    generationMode?: string;
    providerAssetIds?: number[];
    /** model-specific passthrough — video mode only (e.g. { camera_fixed: true }) */
    extraBody?: Record<string, unknown>;
    /** a recorded 3D導演台 運鏡 clip's URL — video mode + Seedance 2.0/2.5 only */
    videoUrl?: string;
  }) => void;
  busy: boolean;
  /** model id from ?model= — pre-selects the model when it matches the mode */
  initialModel?: string;
  /** prompt from ?q= or a template preset */
  initialPrompt?: string;
  /** image param overrides from a template preset */
  initialImgValues?: ImageControlValues;
  /** reference images from a template preset (already cloned to the user) */
  initialRefs?: RefAsset[];
  /** a recorded 3D導演台 運鏡 clip handed off from /canvas/director3d — video mode only */
  initialVideoRef?: { url: string; name?: string };
}) {
  const modeRouter = useRouter();
  const modeParams = useSearchParams();
  const [providerSelection,setProviderSelection] = useState<{model:string;operation:string;ids:number[]}>({model:"",operation:"",ids:[]});
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [settings, setSettings] = useState<GenSettings>(DEFAULT_SETTINGS);
  const [imageEdits, setImageEdits] = useState<{source:string;model:string|undefined;values:ImageControlValues}>({source:`${mode}:${initialModel ?? ""}`,model:initialModel,values:initialImgValues ?? {}});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [rates, setRates] = useState<RateCardEntry[]>([]);
  const selectionSource = `${mode}:${initialModel ?? ""}`;
  const [selection, setSelection] = useState<{id:string;source:string}|null>(null);
  const model = selection?.source === selectionSource ? selection.id : "";
  const [isAdmin, setIsAdmin] = useState(false);
  // Long prompts expand automatically until the user explicitly chooses a size.
  const [manualExpand, setManualExpand] = useState<boolean | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isExpanded = manualExpand ?? prompt.length > 200;

  /* ---- reference materials (image-to-image / Seedance multi-reference video) ---- */
  const [regularRefs, setRefs] = useState<RefAsset[]>(initialRefs ?? []);
  const [frameReset, setFrameReset] = useState(0);
  const [frameSelection, setFrameSelection] = useState<{ session: object; data: FrameSnapshot } | null>(null);
  // A recorded 3D導演台 運鏡 clip, handed off separately from image refs above —
  // Seedance's r2v mode takes it as its own input_references entry (type
  // "video"), not something that fits the @mention/image-strip UI. See
  // lib/videoModels.ts's supportsVideoRefInput for which models accept it.
  const [videoRef, setVideoRef] = useState<{ url: string; name?: string } | null>(initialVideoRef ?? null);
  const [refPicker, setRefPicker] = useState(false);
  const [library, setLibrary] = useState<RefAsset[] | null>(null);
  const [refUpload, setRefUpload] = useState<{ session: object; busy: boolean } | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  /* ---- @mention: type "@" in the prompt to pick a reference asset inline ---- */
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  /* ---- advanced settings (verified real params only — see AdvancedParams.tsx) ---- */
  const [moderation, setModeration] = useState("auto");
  // Default off (no "AI generated" badge) — matches the behaviour before this
  // was made user-controllable. true = keep the provider's watermark.
  const [watermarkChoice, setWatermarkChoice] = useState<{model:string;source:string;enabled:boolean}|null>(null);

  const modalityForMode = mode === "video" ? "video" : mode === "image" ? "image" : "text";
  const available = useMemo(() => {
    const live = models.filter((m) => m.modality === modalityForMode && !/nsfw/i.test(m.id));
    // 語音生成 has no real audio modality on SIRAYA (see lib/audioModels.ts) —
    // it shares "text"'s ~80-model chat-completions list otherwise, which is
    // exactly the "太雜" the curation here fixes.
    if (mode === "audio") return live.filter((m) => AUDIO_MODELS.includes(m.id));
    if (modalityForMode !== "image") return live;
    // Merge the curated image catalogue so links to a specific model resolve
    // even before /api/models has loaded (and so it's pickable in the dropdown).
    const curated: ModelInfo[] = IMAGE_MODELS.filter((m) => !/nsfw/i.test(m.id)).map((m) => ({
      id: m.id,
      ownedBy: m.family,
      created: null,
      modality: "image" as const,
    }));
    const curatedIds = new Set(curated.map((m) => m.id.toLowerCase()));
    return [...curated, ...live.filter((m) => !curatedIds.has(m.id.toLowerCase()))];
  }, [models, modalityForMode, mode]);

  // The user's explicit pick (via the model dropdown) wins once it's in the
  // current `available` list; otherwise fall back to `initialModel` (from
  // ?model=) or just the first available model. Derived during render
  // instead of an effect calling setModel — avoids a redundant extra render
  // each time `available` finishes loading (react-hooks/set-state-in-effect).
  const resolvedModel = useMemo(() => {
    if (model && available.some((m) => m.id === model)) return model;
    const preferred = initialModel
      ? available.find((m) => m.id === initialModel || m.id.toLowerCase() === initialModel.toLowerCase())
      : undefined;
    const defaultVideo = mode === "video" ? available.find(m => m.id === "SIRAYA-Seedance-2.0-mini") ?? available.find(m => /seedance/i.test(m.id) && !/nsfw/i.test(m.id)) : undefined;
    return (preferred ?? defaultVideo ?? available[0])?.id ?? "";
  }, [model, available, initialModel, mode]);

  const operations = mode === "image" || mode === "video" ? getGenerationModes(resolvedModel,mode) : [];
  const [layerSize,setLayerSize] = useState("2K");
  const [layerConfirm,setLayerConfirm] = useState(false);
  const requestedOperation = modeParams.get("operation");
  const operation = operations.find(o=>o.id===requestedOperation && o.enabled)?.id ?? operations.find(o=>o.enabled)?.id ?? "";
  const frameScope = `${mode}:${resolvedModel}:${operation}:${frameReset}`;
  const frameSession = useMemo(() => ({ scope: frameScope }), [frameScope]);
  const frameData: FrameSnapshot = frameSelection?.session === frameSession ? frameSelection.data : { slots: [null, null], uploading: [false, false] };
  const isFramePair = mode === "video" && operation === "first-last-frame";
  const refs = useMemo(() => isFramePair ? frameData.slots.filter((asset): asset is RefAsset => asset !== null) : regularRefs, [isFramePair, frameData.slots, regularRefs]);
  const refSession = useMemo(() => ({ scope: `${mode}:${resolvedModel}:${operation}:${frameReset}` }), [mode, resolvedModel, operation, frameReset]);
  const activeRefSession = useRef<object | null>(null);
  const refBusy = refUpload?.session === refSession && refUpload.busy;
  useEffect(() => { activeRefSession.current = refSession; return () => { if (activeRefSession.current === refSession) activeRefSession.current = null; }; }, [refSession]);
  // A repeated sidebar pick can target the current URL after the user changed
  // the dropdown. Treat that click as a fresh selection without clearing drafts.
  useEffect(() => {
    const selectFromSidebar = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: Mode; model: string; operation?: string }>).detail;
      if (detail && detail.mode === mode && !/nsfw/i.test(detail.model)) {
        setSelection({ id: detail.model, source: `${detail.mode}:${detail.model}` });
        setRefs([]); setFrameReset(value => value + 1); setProviderSelection({model:"",operation:"",ids:[]});
        setVideoRef(null); setRefPicker(false); setLayerConfirm(false); activeRefSession.current = null; setRefUpload(null);
      }
    };
    window.addEventListener("bluewing:model-select", selectFromSidebar);
    return () => window.removeEventListener("bluewing:model-select", selectFromSidebar);
  }, [mode]);

  const providerIds = providerSelection.model === resolvedModel && providerSelection.operation === operation ? providerSelection.ids : [];
  const watermark = watermarkChoice?.model === resolvedModel && watermarkChoice.source === selectionSource ? watermarkChoice.enabled : false;
  const setWatermark = (enabled:boolean) => setWatermarkChoice({model:resolvedModel,source:selectionSource,enabled});
  const imgEdits = useMemo(() => imageEdits.source === selectionSource && (!imageEdits.model || imageEdits.model === resolvedModel) ? imageEdits.values : {}, [imageEdits, selectionSource, resolvedModel]);
  const setImgEdits = (values:ImageControlValues) => setImageEdits({source:selectionSource,model:resolvedModel,values});

  // Image mode: fixed MAX_REF_IMAGES cap, gated by the model's family.
  // Video mode: only Seedance models support this on SIRAYA, and the cap
  // varies per model (Seedance 2.5 → 50; see lib/videoModels.ts).
  const refCap = operation === "layer-separation" ? 1 : operation === "first-last-frame" ? 2 : operation === "image-to-video" ? 1 : mode === "video" ? maxRefsForVideoModel(resolvedModel) : MAX_REF_IMAGES;

  const addRef = (a: RefAsset) =>
    setRefs((cur) => (cur.some((r) => r.id === a.id) || cur.length >= refCap ? cur : [...cur, a]));
  const toggleRef = (a: RefAsset) =>
    setRefs((cur) =>
      cur.some((r) => r.id === a.id)
        ? cur.filter((r) => r.id !== a.id)
        : cur.length >= refCap
          ? cur
          : [...cur, a]
    );

  const ensureLibrary = () => {
    if (library !== null) return;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { assets: RefAsset[] }) => setLibrary(j.assets))
      .catch(() => setLibrary([]));
  };

  const openPicker = () => {
    setRefPicker(true);
    setRefError(null);
    ensureLibrary();
  };

  const uploadRef = async (files: FileList) => {
    setRefUpload({ session: refSession, busy: true });
    setRefError(null);
    try {
      for (const file of Array.from(files)) {
        if (activeRefSession.current !== refSession) break;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (activeRefSession.current !== refSession) break;
        if (!res.ok) {
          setRefError(j?.error?.message || "上傳失敗");
          continue;
        }
        setLibrary((cur) => (cur ? [j.asset, ...cur] : [j.asset]));
        addRef(j.asset);
      }
    } catch {
      if (activeRefSession.current === refSession) setRefError("圖片上傳失敗，請檢查連線後重試。");
    } finally {
      setRefUpload(previous => previous?.session === refSession ? { session: refSession, busy: false } : previous);
    }
  };

  useEffect(() => {
    let alive = true;
    const refreshRole = () => fetch("/api/auth/me", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { if (alive) setIsAdmin(j?.user?.role === "admin"); }).catch(() => { if (alive) setIsAdmin(false); });
    void refreshRole();
    window.addEventListener("focus", refreshRole);
    fetch("/api/models")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || "無法載入模型清單");
        return j;
      })
      .then((j) => {
        if (!alive) return;
        setModels(j.models ?? []);
        setModelsError(null);
      })
      .catch((e) => alive && setModelsError(e.message))
      .finally(() => alive && setLoadingModels(false));
    fetch("/api/rates")
      .then((r) => (r.ok ? r.json() : { rates: [] }))
      .then((j) => alive && setRates(j.rates ?? []))
      .catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener("focus", refreshRole);
    };
  }, []);

  const activeImageModel = modalityForMode === "image" ? getImageModelForControls(resolvedModel) : undefined;

  // Effective params = the model's defaults with the user's explicit edits on
  // top. Picking a different model clears imgEdits (see the model dropdown), so
  // switching models auto-resets the param set to that model's supported knobs.
  const imgValues = useMemo<ImageControlValues>(
    () => (activeImageModel ? { ...defaultValues(activeImageModel), ...imgEdits } : {}),
    [activeImageModel, imgEdits]
  );

  const effectiveSettings = mode === "video" ? { ...settings, resolution: normalizeVideoResolution(resolvedModel, settings.resolution), seconds: Math.min(settings.seconds, videoConstraintFor(resolvedModel).maxSeconds) } : settings;
  const imageCount = operation === "layer-separation" ? 17 : activeImageModel ? Number(imgValues.n ?? 1) : settings.imageCount;

  const cost = useMemo(
    () =>
      estimateCost({
        model: resolvedModel || "unknown",
        modality: modalityForMode,
        prompt,
        maxTokens: settings.maxTokens,
        imageCount,
        seconds: effectiveSettings.seconds,
      }),
    [resolvedModel, modalityForMode, prompt, settings, imageCount, effectiveSettings.seconds]
  );

  const credits =
    creditsFromRateCard(rates, resolvedModel, { imageCount, seconds: effectiveSettings.seconds, maxTokens: settings.maxTokens, resolution: effectiveSettings.resolution });
  const modeRefsValid = operation === "layer-separation" ? refs.length===1 : operation === "first-last-frame" ? orderedFrameIds(frameData.slots) !== null && !frameData.uploading.some(Boolean) && !providerIds.length : operation === "image-to-video" ? refs.length === 1 && !providerIds.length : operation === "subject-reference" ? refs.length+providerIds.length>0 : true;
  const canSubmit = modeRefsValid && !refBusy && (operation === "layer-separation" || !!prompt.trim()) && !!resolvedModel && !busy && credits !== null && (mode !== "video" || !!effectiveSettings.resolution);

  // Image mode: seedream/gemini models. Video mode: Seedance models only.
  // When neither applies, stale refs are simply ignored (submit + render both gate on this).
  const canUseRefs =
    (mode === "image" && supportsRefImages(activeImageModel)) || (mode === "video" && refCap > 0);

  // Reference-to-video (r2v) — verified live against SIRAYA-Seedance-2.5 on
  // 2026-09-06 (see lib/videoModels.ts). Only these two model versions are
  // confirmed to accept a video-type reference at all.
  const videoRefSupported = mode === "video" && supportsVideoRefInput(resolvedModel);

  // Only Seedream (image) / Seedance (video) are verified to accept the
  // `watermark` field — GPT Image 2 rejects it outright ("Unknown parameter:
  // 'watermark'") since it proxies straight to OpenAI's own API. Gate the
  // switch itself so users on unsupported models never hit that error.
  const watermarkSupported = mode === "image" ? supportsImageWatermark(resolvedModel) : mode === "video" && supportsVideoWatermark(resolvedModel);

  // @ is for TAGGING an already-added reference inline in the prompt — not
  // for browsing/adding from the asset library (that's what the 素材 button
  // is for). Real-world test: asked Seedream for "the shape from reference 1,
  // the colour from reference 2" with two very different images — it just
  // overlaid both images wholesale instead of following the per-image
  // instruction. So a specific image can't actually be bound to a specific
  // instruction through this API; the tag is a plain-text label for your own
  // writing, stripped before the request goes out (see submit()) — it does
  // NOT make the model treat that instruction as applying to that one image.
  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return refs.filter((r) => r.name.toLowerCase().includes(q));
  }, [mention, refs]);

  /** Inserts "@AssetName" — tagging one of the already-added references —
   *  at the mention's position in the prompt. */
  const pickMention = (a: RefAsset) => {
    if (!mention) return;
    const tag = mentionTagFor(a.name);
    const before = prompt.slice(0, mention.start);
    const after = prompt.slice(mention.start + 1 + mention.query.length);
    const next = `${before}@${tag} ${after}`;
    setPrompt(next);
    setMention(null);
    setMentionIndex(0);
    const cursor = before.length + tag.length + 2;
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  /** "全部標註" — insert a tag for every added reference at once. */
  const pickAllMentionMatches = () => {
    if (!mention || !mentionMatches.length) return;
    const tags = mentionMatches.map((a) => `@${mentionTagFor(a.name)}`).join(" ");
    const before = prompt.slice(0, mention.start);
    const after = prompt.slice(mention.start + 1 + mention.query.length);
    const next = `${before}${tags} ${after}`;
    setPrompt(next);
    setMention(null);
    setMentionIndex(0);
    const cursor = before.length + tags.length + 1;
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? val.length;
    setPrompt(val);
    if (!canUseRefs) {
      if (mention) setMention(null);
      return;
    }
    const before = val.slice(0, pos);
    const m = before.match(/(?:^|\s)@([^\s@]{0,40})$/);
    if (m) {
      setMention({ query: m[1], start: pos - m[1].length - 1 });
      setMentionIndex(0);
    } else if (mention) {
      setMention(null);
    }
  };

  const selectModelFunction = (id:string, requested?:string) => {
    const next = modelFunctionSelection(modeParams.toString(), mode, id, requested);
    setSelection({id:next.model,source:`${mode}:${next.model}`});
    setImageEdits({source:`${mode}:${next.model}`,model:next.model,values:{}});
    setRefs([]); setFrameReset(value => value + 1); setProviderSelection({model:"",operation:"",ids:[]});
    setVideoRef(null); setRefPicker(false); setLayerConfirm(false); activeRefSession.current = null; setRefUpload(null);
    modeRouter.replace(next.href,{scroll:false});
  };

  const submit = (confirmed=false) => {
    if (!canSubmit) return;
    if(operation==="layer-separation" && !confirmed){setLayerConfirm(true);return;}
    const assetIds = canUseRefs ? isFramePair ? orderedFrameIds(frameData.slots)! : refs.map((r) => r.id) : [];
    // The image itself already carries the reference — strip the "@Name" tag
    // out of the text so the model isn't fed a literal filename token.
    let finalPrompt = prompt.trim() || (operation==="layer-separation" ? "Decompose the main visual elements into independent layers." : "");
    if (canUseRefs) {
      for (const r of refs) {
        const tag = escapeRegExp(mentionTagFor(r.name));
        finalPrompt = finalPrompt.replace(new RegExp(`@${tag}(?=\\s|$)\\s*`, "g"), "").trim();
      }
    }
    const imagePayload = operation === "layer-separation" ? {model:resolvedModel,prompt:finalPrompt,assetIds:refs.map(r=>r.id),n:1,size:layerSize,layer_decomposition:true,output_format:"png",response_format:"url",watermark:false,confirmedMaxCredits:credits} : activeImageModel
      ? buildImagePayload(activeImageModel, finalPrompt, imgValues, assetIds, resolvedModel)
      : undefined;
    if (imagePayload && operation!=="layer-separation") {
      if (moderation !== "auto") imagePayload.moderation = moderation;
      if (watermarkSupported) imagePayload.watermark = watermark;
    }

    onSubmit({
      prompt: finalPrompt,
      model: resolvedModel,
      settings: effectiveSettings,
      imagePayload,
      assetIds: mode === "video" && canUseRefs && operation!=="text-to-video" ? assetIds : undefined,
      generationMode: mode === "video" ? operation || undefined : undefined,
      providerAssetIds: mode === "video" ? providerIds : undefined,
      extraBody: mode === "video" && watermarkSupported ? { watermark } : undefined,
      videoUrl: videoRefSupported && videoRef ? videoRef.url : undefined,
    });
    setLayerConfirm(false);
    setProviderSelection({model:"",operation:"",ids:[]});
    setPrompt("");
    setManualExpand(null);
    setRefs([]);
    setFrameReset(value => value + 1);
    setRefPicker(false);
    setMention(null);
    setVideoRef(null);
  };

  return (
    <div
      className={[
        "rounded-2xl border border-[#2a2a2a] bg-[#161616] transition-all",
        isExpanded ? "min-h-[260px]" : "",
      ].join(" ")}
    >
      {operation==="layer-separation" && <div className="px-4 py-3 text-xs text-[#b2c8c0]"><p>限一張 PNG／JPEG。提示詞可留空，自動分離底圖與最多 16 個透明圖層。</p><label className="mt-2 block">輸出解析度 <select aria-label="圖層解析度" value={layerSize} onChange={e=>setLayerSize(e.target.value)} className="ml-2 rounded bg-[#252525] p-2">{["auto","1K","1.5K","2K"].map(v=><option key={v} value={v}>{v}</option>)}</select></label><Link href="/layers" className="mt-2 inline-block underline">查看圖層紀錄</Link></div>}
      {layerConfirm && operation==="layer-separation" && <div role="dialog" aria-label="確認圖層分離費用" className="mx-4 my-3 rounded-xl border border-[#5ea994] bg-[#122c24] p-4"><p>最高預扣 {credits} 點（底圖與最多 16 個圖層）。每張 {credits === null ? "—" : credits / 17} 點，完成後按實際輸出張數結算，多退少不補；生成失敗退回。</p><div className="mt-3 flex gap-4"><button type="button" disabled={!canSubmit} onClick={()=>submit(true)}>確認預扣並分離</button><button type="button" onClick={()=>setLayerConfirm(false)}>取消</button></div></div>}
      {isFramePair && <FrameUploadCards key={frameScope} disabled={busy} onChange={data => setFrameSelection({ session: frameSession, data })} />}
      <div className="relative flex flex-wrap gap-3 px-4 pt-4">
        {canUseRefs && !isFramePair && (
          <div className="relative flex w-full min-w-0 flex-wrap items-start gap-3 pb-1">
            {refs.map((r) => (
              <div key={r.id} className="relative h-[82px] w-[82px] -rotate-2 overflow-hidden rounded-xl border border-[#454545] shadow-md transition-transform hover:rotate-0 focus-within:rotate-0 motion-reduce:transition-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream */}
                <img src={r.src} alt={r.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setRefs((cur) => cur.filter((x) => x.id !== r.id))}
                  className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-[10px] text-white hover:bg-black"
                  aria-label="移除素材"
                >
                  ×
                </button>
              </div>
            ))}

            {refs.length < refCap && (
              <button
                type="button"
                onClick={() => (refPicker ? setRefPicker(false) : openPicker())}
                className="group grid h-[82px] w-[106px] shrink-0 -rotate-2 place-items-center rounded-xl border border-dashed border-[#505050] bg-gradient-to-br from-[#2b2b2b] to-[#1c1c1c] px-2 py-2 text-[#d2d2d2] shadow-md transition-transform hover:rotate-0 hover:border-[#858585] focus-visible:rotate-0 focus-visible:outline-[#7ff0cd] motion-reduce:transition-none"
              >
                <IconPlus className="h-4 w-4" />
                <span className="text-[11px]">加入參考素材</span>
                <span className="text-[9px] text-[#949494]">上傳 / 素材庫</span>
              </button>
            )}

            {refPicker && (
              <div className="bw-menu absolute bottom-[calc(100%+8px)] left-0 z-40 w-[320px] max-w-[calc(100vw-64px)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-white">參考素材（最多 {refCap} 個）</span>
                  <button type="button" onClick={() => setRefPicker(false)} className="text-[11px] text-[#8a8a8a] hover:text-white">關閉</button>
                </div>

                <button
                  type="button"
                  onClick={() => refInputRef.current?.click()}
                  disabled={refBusy}
                  className="mt-2 w-full rounded-lg border border-dashed border-[#3a3a3a] bg-[#1c1c1c] py-2 text-[12px] text-[#c9c9c9] hover:border-[#555] disabled:opacity-50"
                >
                  {refBusy ? "上傳中…" : "上傳圖片"}
                </button>
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) uploadRef(e.target.files);
                    e.target.value = "";
                  }}
                />

                {refError && <p className="mt-2 text-[11px] text-[#ff9b9b]">{refError}</p>}

                <p className="mt-2 text-[10.5px] text-[#6d6d6d]">
                  小技巧：素材加進來之後，在下面輸入框打 <span className="text-[#9a9a9a]">@</span> 可以標記你這句話說的是哪一張
                </p>

                <div className="mt-2 text-[11px] text-[#8a8a8a]">從資產庫選</div>
                <div className="mt-1 grid max-h-[180px] grid-cols-4 gap-1.5 overflow-y-auto">
                  {library === null && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">載入中…</span>}
                  {library?.length === 0 && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">資產庫還沒有圖片</span>}
                  {library?.map((a) => {
                    const on = refs.some((r) => r.id === a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        title={a.name}
                        onClick={() => toggleRef(a)}
                        className={`relative aspect-square overflow-hidden rounded-md border ${on ? "border-[#7ff0cd]" : "border-[#2a2a2a] hover:border-[#4a4a4a]"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream */}
                        <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
                        {on && <span className="absolute inset-0 grid place-items-center bg-black/40 text-[11px] text-[#7ff0cd]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {videoRef && mode === "video" && (
          <div className="relative flex h-[74px] w-[74px] shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-[#2f2f2f] bg-[#1c1c1c] px-1 text-center">
            <span className="text-lg leading-none">🎬</span>
            <span className="text-[9.5px] leading-tight text-[#9a9a9a]">
              {videoRefSupported ? "運鏡影片" : "目前模型不支援"}
            </span>
            <button
              type="button"
              onClick={() => setVideoRef(null)}
              className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-[10px] text-white hover:bg-black"
              aria-label="移除運鏡影片參考"
            >
              ×
            </button>
          </div>
        )}

        <div className="relative min-w-0 flex-1">
          <textarea
            ref={taRef}
            value={prompt}
            onChange={handlePromptChange}
            onKeyDown={(e) => {
              if (mention && e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
              if (mention && mentionMatches.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionMatches.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickMention(mentionMatches[mentionIndex]);
                  return;
                }
                if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  pickAllMentionMatches();
                  return;
                }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            onBlur={() => {
              // let a mousedown on the dropdown register before it disappears
              setTimeout(() => setMention(null), 120);
            }}
            placeholder={canUseRefs && refs.length > 0 ? `${PLACEHOLDER[mode]}（可打 @ 標記素材）` : PLACEHOLDER[mode]}
            rows={isExpanded ? 8 : 3}
            className="w-full resize-none bg-transparent pr-8 text-[14px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none"
            // A flat 320px was the original "expanded" cap — nowhere near
            // enough for a genuinely long multi-scene prompt (a real one hit
            // ~1500+ characters), so scrolling that tiny a window through a
            // wall of text to find the top again felt broken even though it
            // was technically scrollable. Scaling with the viewport instead
            // gives real room on real screens while still guaranteeing the
            // submit button below it never gets pushed off-screen.
            style={{ maxHeight: isExpanded ? "55vh" : 92, overflowY: "auto" }}
          />

          {mention && (
            // Opens upward (bottom-full), same as every other popover anchored to
            // this bottom-docked composer (see 素材 picker / Popover.tsx below) —
            // opening downward here used to get clipped by the viewport's bottom
            // edge, which made items near the edge hard to actually click.
            <div className="bw-menu absolute bottom-full left-0 z-40 mb-1.5 w-[290px] max-h-[280px] overflow-y-auto p-1.5">
              <div className="sticky top-0 z-10 -m-1.5 mb-1 flex items-center justify-between bg-[#1a1a1a] px-2.5 py-1.5">
                <span className="text-[11px] text-[#8a8a8a]">標記已加入的素材</span>
                <div className="flex items-center gap-2">
                  {mentionMatches.length > 1 && (
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={pickAllMentionMatches} className="text-[11px] text-[#7ff0cd] hover:underline">
                      全部標註
                    </button>
                  )}
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setMention(null)} className="text-[11px] text-[#8a8a8a] hover:text-white">
                    關閉
                  </button>
                </div>
              </div>
              {refs.length === 0 && (
                <div className="px-3 py-3 text-[12px] leading-relaxed text-[#6d6d6d]">
                  還沒有加入素材 — 先點左邊的「素材」按鈕選取，再用 @ 標記你要在這句話裡指的是哪一張
                </div>
              )}
              {refs.length > 0 && mentionMatches.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-[#6d6d6d]">找不到符合的素材</div>
              )}
              {mentionMatches.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  // avoid the textarea's onBlur firing before the click registers
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(a)}
                  className={`bw-menu-item ${i === mentionIndex ? "bg-[#242424]" : ""}`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-[#242424]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream */}
                    <img src={a.src} alt="" className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{a.name}</span>
                </button>
              ))}
              {refs.length > 0 && (
                <p className="mt-1 px-2.5 pb-0.5 text-[10px] leading-relaxed text-[#6d6d6d]">
                  標記只是方便你自己書寫辨識。@名稱 本身模型看不懂——想讓模型正確分辨每張圖的用途，實測有效的寫法是先用文字描述每張圖，再說怎麼處理，例如：「圖1是⋯⋯，圖2是⋯⋯，請用圖1的形狀、圖2的顏色」
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setManualExpand(!isExpanded)}
          aria-label={isExpanded ? "收合" : "展開"}
          className="absolute right-4 top-4 text-[#7a7a7a] transition-colors hover:text-white"
        >
          <IconExpand className="h-4 w-4" />
        </button>
      </div>

      {activeImageModel?.slow && (
        <div className="mx-3 mb-1 rounded-lg border border-[#3a2e18] bg-[#241d10] px-3 py-2 text-[11.5px] leading-relaxed text-[#f0c27f]">
          {activeImageModel.name} 生成通常超過 60 秒，在 Vercel 免費方案會逾時失敗。建議改用 Seedream 系列或 Gemini Flash；需要跑這個模型請把 Vercel 專案升級為 Pro（函式上限 300 秒）。
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-3">
        {/* mode */}
        <Popover
          widthClass="w-[164px]"
          trigger={(open) => {
            const Icon = MODE_ITEMS.find((m) => m.id === mode)?.icon ?? IconVideo;
            return (
              <>
                <Icon className="h-[15px] w-[15px]" />
                {MODE_LABELS[mode]}
                <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              </>
            );
          }}
        >
          {(close) => (
            <>
              {MODE_ITEMS.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="bw-menu-item"
                    onClick={() => {
                      onModeChange(m.id);
                      close();
                    }}
                  >
                    <Icon className="h-[15px] w-[15px]" />
                    <span className="flex-1">{m.label}</span>
                    {m.id === mode && <IconCheck className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
              <button type="button" className="bw-menu-item" onClick={close}>
                <IconAvatar className="h-[15px] w-[15px]" />
                <span className="flex-1 text-[#6d6d6d]">數位人（即將推出）</span>
              </button>
            </>
          )}
        </Popover>

        {/* Models and their functions share one bounded two-level menu. */}
        <Popover label="選擇模型與功能" widthClass="w-[560px]" triggerClassName="max-w-[calc(100vw-84px)]" trigger={(open) => (
          <>
            <IconModel className="h-[15px] w-[15px] shrink-0" />
            <span className="min-w-0 max-w-[155px] truncate">{loadingModels ? "載入模型…" : resolvedModel ? modelLabel(available.find((m) => m.id === resolvedModel)?.displayName ?? getImageModel(resolvedModel)?.name ?? resolvedModel) : "無可用模型"}</span>
            {operations.find(item=>item.id===operation)?.label && <span className="min-w-0 max-w-[96px] truncate border-l border-white/15 pl-2 text-[11px] text-[#a8a8a8]">{operations.find(item=>item.id===operation)!.label}</span>}
            <IconChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        )}>
          {(close) => <ModelFunctionMenu models={available} mode={mode} selectedModel={resolvedModel} selectedOperation={operation} loading={loadingModels} error={modelsError} onSelect={(id,operation)=>{selectModelFunction(id,operation);close();}} />}
        </Popover>
        {(mode==="image"||mode==="video") && <GenerationModePanel key={`${mode}:${resolvedModel}:${operation}`} model={resolvedModel} kind={mode} operation={operation} selected={providerIds} onSelected={ids=>setProviderSelection({model:resolvedModel,operation,ids})} />}

        {/* generation settings — model-aware for catalogued image models */}
        {operation==="layer-separation" ? null : activeImageModel ? (
          <ImageParams model={activeImageModel} values={imgValues} onChange={setImgEdits} />
        ) : (
          <SettingsPopover mode={mode} modelId={resolvedModel} settings={effectiveSettings} onChange={setSettings} />
        )}

        <AdvancedParams
          mode={mode}
          moderation={moderation}
          onModerationChange={setModeration}
          watermark={watermark}
          onWatermarkChange={setWatermark}
          watermarkSupported={watermarkSupported}
        />

        <div className="ml-auto mr-14 flex items-center gap-3">
          {isAdmin && <span data-testid="admin-provider-estimate" className="hidden text-[11.5px] text-[#6d6d6d] sm:inline" title="服務商成本預估，僅管理員可見；站內扣點依既定費率">
            預估 {formatUSD(cost)}
          </span>}
          <button
            type="button"
            onClick={()=>submit()}
            disabled={!canSubmit}
            className={[
              "flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition-all",
              canSubmit
                ? "bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16] hover:brightness-105"
                : "cursor-not-allowed bg-[#2a2a2a] text-[#6d6d6d]",
            ].join(" ")}
          >
            <IconSparkle className="h-4 w-4" />
            {busy ? "生成中…" : credits === null ? "費率未設定" : `${operation==="layer-separation"?"最高 ":""}${credits} 點`}
          </button>
        </div>
      </div>
    </div>
  );
}
