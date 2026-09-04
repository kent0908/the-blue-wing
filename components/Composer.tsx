"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Popover from "./Popover";
import SettingsPopover from "./SettingsPopover";
import {
  IconChevronDown,
  IconModel,
  IconVideo,
  IconImage,
  IconChat,
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
  defaultValues,
  buildImagePayload,
  supportsRefImages,
  MAX_REF_IMAGES,
  type ImageControlValues,
} from "@/lib/imageModels";
import { maxRefsForVideoModel } from "@/lib/videoModels";

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

const MODE_ITEMS: { id: Mode; label: string; icon: (p: { className?: string }) => React.ReactElement }[] = [
  { id: "image", label: "智慧生圖", icon: IconImage },
  { id: "video", label: "智慧影片", icon: IconVideo },
  { id: "text", label: "多輪對話", icon: IconChat },
  { id: "audio", label: "語音", icon: IconAudio },
];

const PLACEHOLDER: Record<Mode, string> = {
  video: "描述你想生成的影片畫面",
  image: "描述你想生成的圖片畫面",
  text: "輸入你的問題或指令",
  audio: "輸入要轉成語音的文字",
};

/** Credits shown on the submit pill — 1 credit ≈ US$0.005, matching the
 *  order of magnitude of a short 480p clip. Purely a display convention. */
const CREDITS_PER_USD = 200;

export default function Composer({
  mode,
  onModeChange,
  onSubmit,
  busy,
  initialModel,
  initialPrompt,
  initialImgValues,
  initialRefs,
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
    /** model-specific passthrough — video mode only (e.g. { camera_fixed: true }) */
    extraBody?: Record<string, unknown>;
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
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [settings, setSettings] = useState<GenSettings>(DEFAULT_SETTINGS);
  const [imgEdits, setImgEdits] = useState<ImageControlValues>(initialImgValues ?? {});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [rates, setRates] = useState<RateCardEntry[]>([]);
  const [model, setModel] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* ---- reference materials (image-to-image / Seedance multi-reference video) ---- */
  const [refs, setRefs] = useState<RefAsset[]>(initialRefs ?? []);
  const [refPicker, setRefPicker] = useState(false);
  const [library, setLibrary] = useState<RefAsset[] | null>(null);
  const [refBusy, setRefBusy] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  /* ---- @mention: type "@" in the prompt to pick a reference asset inline ---- */
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  /* ---- advanced settings (verified real params only — see AdvancedParams.tsx) ---- */
  const [moderation, setModeration] = useState("auto");

  // Image mode: fixed MAX_REF_IMAGES cap, gated by the model's family.
  // Video mode: only Seedance models support this on SIRAYA, and the cap
  // varies per model (Seedance 2.5 → 50; see lib/videoModels.ts).
  const refCap = mode === "video" ? maxRefsForVideoModel(model) : MAX_REF_IMAGES;

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
    setRefBusy(true);
    setRefError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRefError(j?.error?.message || "上傳失敗");
          continue;
        }
        setLibrary((cur) => (cur ? [j.asset, ...cur] : [j.asset]));
        addRef(j.asset);
      }
    } finally {
      setRefBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoadingModels(true);
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
    };
  }, []);

  const modalityForMode = mode === "video" ? "video" : mode === "image" ? "image" : "text";
  const available = useMemo(() => {
    const live = models.filter((m) => m.modality === modalityForMode);
    if (modalityForMode !== "image") return live;
    // Merge the curated image catalogue so links to a specific model resolve
    // even before /api/models has loaded (and so it's pickable in the dropdown).
    const curated: ModelInfo[] = IMAGE_MODELS.map((m) => ({
      id: m.id,
      ownedBy: m.family,
      created: null,
      modality: "image" as const,
    }));
    const curatedIds = new Set(curated.map((m) => m.id.toLowerCase()));
    return [...curated, ...live.filter((m) => !curatedIds.has(m.id.toLowerCase()))];
  }, [models, modalityForMode]);

  useEffect(() => {
    if (!available.length || available.some((m) => m.id === model)) return;
    const preferred = initialModel
      ? available.find(
          (m) => m.id === initialModel || m.id.toLowerCase() === initialModel.toLowerCase()
        )
      : undefined;
    setModel((preferred ?? available[0]).id);
  }, [available, model, initialModel]);

  const activeImageModel = modalityForMode === "image" ? getImageModel(model) : undefined;

  // Effective params = the model's defaults with the user's explicit edits on
  // top. Picking a different model clears imgEdits (see the model dropdown), so
  // switching models auto-resets the param set to that model's supported knobs.
  const imgValues = useMemo<ImageControlValues>(
    () => (activeImageModel ? { ...defaultValues(activeImageModel), ...imgEdits } : {}),
    [activeImageModel, imgEdits]
  );

  const imageCount = activeImageModel ? Number(imgValues.n ?? 1) : settings.imageCount;

  const cost = useMemo(
    () =>
      estimateCost({
        model: model || "unknown",
        modality: modalityForMode,
        prompt,
        maxTokens: settings.maxTokens,
        imageCount,
        seconds: settings.seconds,
      }),
    [model, modalityForMode, prompt, settings, imageCount]
  );

  const credits =
    creditsFromRateCard(rates, model, { imageCount, seconds: settings.seconds, maxTokens: settings.maxTokens }) ??
    Math.max(1, Math.round(cost * CREDITS_PER_USD));
  const canSubmit = !!prompt.trim() && !!model && !busy;

  // Image mode: seedream/gemini models. Video mode: Seedance models only.
  // When neither applies, stale refs are simply ignored (submit + render both gate on this).
  const canUseRefs =
    (mode === "image" && supportsRefImages(activeImageModel)) || (mode === "video" && refCap > 0);

  const mentionMatches = useMemo(() => {
    if (!mention || !library) return [];
    const q = mention.query.toLowerCase();
    return library
      .filter((a) => a.name.toLowerCase().includes(q) && !refs.some((r) => r.id === a.id))
      .slice(0, 8);
  }, [mention, library, refs]);

  /** Inserts "@AssetName " at the mention's position and adds it to the active
   *  reference set (up to MAX_REF_IMAGES) — same effect as picking it from 素材. */
  const pickMention = (a: RefAsset) => {
    if (!mention) return;
    const tag = mentionTagFor(a.name);
    const before = prompt.slice(0, mention.start);
    const after = prompt.slice(mention.start + 1 + mention.query.length);
    const next = `${before}@${tag} ${after}`;
    setPrompt(next);
    setMention(null);
    setMentionIndex(0);
    addRef(a);
    const cursor = before.length + tag.length + 2;
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
      ensureLibrary();
    } else if (mention) {
      setMention(null);
    }
  };

  const submit = () => {
    if (!canSubmit) return;
    const assetIds = canUseRefs ? refs.map((r) => r.id) : [];
    // The image itself already carries the reference — strip the "@Name" tag
    // out of the text so the model isn't fed a literal filename token.
    let finalPrompt = prompt.trim();
    if (canUseRefs) {
      for (const r of refs) {
        const tag = escapeRegExp(mentionTagFor(r.name));
        finalPrompt = finalPrompt.replace(new RegExp(`@${tag}(?=\\s|$)\\s*`, "g"), "").trim();
      }
    }
    const imagePayload = activeImageModel
      ? buildImagePayload(activeImageModel, finalPrompt, imgValues, assetIds)
      : undefined;
    if (imagePayload && moderation !== "auto") imagePayload.moderation = moderation;

    onSubmit({
      prompt: finalPrompt,
      model,
      settings,
      imagePayload,
      assetIds: mode === "video" && canUseRefs ? assetIds : undefined,
    });
    setPrompt("");
    setRefs([]);
    setRefPicker(false);
    setMention(null);
  };

  return (
    <div
      className={[
        "rounded-2xl border border-[#2a2a2a] bg-[#161616] transition-all",
        expanded ? "min-h-[260px]" : "",
      ].join(" ")}
    >
      <div className="relative flex gap-3 px-4 pt-4">
        {canUseRefs && (
          <div className="relative flex shrink-0 items-start gap-2">
            {refs.map((r) => (
              <div key={r.id} className="relative h-[74px] w-[74px] overflow-hidden rounded-xl border border-[#2f2f2f]">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream */}
                <img src={r.src} alt="" className="h-full w-full object-cover" />
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
                className="group grid h-[74px] w-[74px] shrink-0 place-items-center rounded-xl border border-dashed border-[#3a3a3a] bg-[#1f1f1f] text-[#9a9a9a] transition-colors hover:border-[#555] hover:text-white"
              >
                <IconPlus className="h-4 w-4" />
                <span className="mt-0.5 text-[11px]">素材</span>
              </button>
            )}

            {refPicker && (
              <div className="bw-menu absolute bottom-[calc(100%+8px)] left-0 z-40 w-[320px] p-3">
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
                  小技巧：在下面輸入框打 <span className="text-[#9a9a9a]">@</span> 也可以直接搜尋、指定素材
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

        <div className="relative min-w-0 flex-1">
          <textarea
            ref={taRef}
            value={prompt}
            onChange={handlePromptChange}
            onKeyDown={(e) => {
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
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMention(null);
                  return;
                }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            onBlur={() => {
              // let a mousedown on the dropdown register before it disappears
              setTimeout(() => setMention(null), 120);
            }}
            placeholder={canUseRefs ? `${PLACEHOLDER[mode]}（可打 @ 指定素材）` : PLACEHOLDER[mode]}
            rows={expanded ? 8 : 3}
            className="w-full resize-none bg-transparent pr-8 text-[14px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none"
          />

          {mention && (
            <div className="bw-menu absolute left-0 top-full z-40 mt-1 w-[260px] max-h-[220px] overflow-y-auto p-1.5">
              {library === null && <div className="px-3 py-3 text-[12px] text-[#6d6d6d]">載入素材中…</div>}
              {library !== null && mentionMatches.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-[#6d6d6d]">
                  {library.length === 0 ? "資產庫還沒有素材，先上傳一張" : "找不到符合的素材"}
                </div>
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
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "收合" : "展開"}
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

        {/* model */}
        <Popover
          widthClass="w-[330px]"
          trigger={(open) => (
            <>
              <IconModel className="h-[15px] w-[15px]" />
              {loadingModels ? "載入模型…" : model || "無可用模型"}
              <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </>
          )}
        >
          {(close) => (
            <div className="max-h-[320px] overflow-y-auto">
              {modelsError && (
                <div className="px-3 py-3 text-[12.5px] leading-relaxed text-[#ff9b9b]">
                  {modelsError}
                </div>
              )}
              {!modelsError && available.length === 0 && (
                <div className="px-3 py-3 text-[12.5px] text-[#8a8a8a]">
                  {loadingModels ? "載入中…" : "此模式目前沒有可用模型"}
                </div>
              )}
              {available.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="bw-menu-item"
                  onClick={() => {
                    setModel(m.id);
                    setImgEdits({});
                    if (!supportsRefImages(getImageModel(m.id))) {
                      setRefs([]);
                      setRefPicker(false);
                    }
                    close();
                  }}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#242424]">
                    <IconModel className="h-[15px] w-[15px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">
                      {getImageModel(m.id)?.name ?? m.id}
                    </span>
                    <span className="block truncate text-[11.5px] text-[#7d7d7d]">{m.id}</span>
                  </span>
                  {m.id === model && <IconCheck className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </Popover>

        {/* generation settings — model-aware for catalogued image models */}
        {activeImageModel ? (
          <ImageParams model={activeImageModel} values={imgValues} onChange={setImgEdits} />
        ) : (
          <SettingsPopover mode={mode} settings={settings} onChange={setSettings} />
        )}

        <AdvancedParams mode={mode} moderation={moderation} onModerationChange={setModeration} />

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11.5px] text-[#6d6d6d] sm:inline" title="依模型費率預估，實際費用以回應中的 usage 為準">
            預估 {formatUSD(cost)}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={[
              "flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition-all",
              canSubmit
                ? "bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16] hover:brightness-105"
                : "cursor-not-allowed bg-[#2a2a2a] text-[#6d6d6d]",
            ].join(" ")}
          >
            <IconSparkle className="h-4 w-4" />
            {busy ? "生成中…" : credits}
          </button>
        </div>
      </div>
    </div>
  );
}
