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
  IconSettings,
} from "./Icons";
import { DEFAULT_SETTINGS, MODE_LABELS, type GenSettings, type Mode, type ModelInfo } from "@/lib/types";
import { estimateCost, formatUSD } from "@/lib/pricing";

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
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSubmit: (args: { prompt: string; model: string; settings: GenSettings }) => void;
  busy: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<GenSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [model, setModel] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

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
    return () => {
      alive = false;
    };
  }, []);

  const modalityForMode = mode === "video" ? "video" : mode === "image" ? "image" : "text";
  const available = useMemo(
    () => models.filter((m) => m.modality === modalityForMode),
    [models, modalityForMode]
  );

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === model)) {
      setModel(available[0].id);
    }
  }, [available, model]);

  const cost = useMemo(
    () =>
      estimateCost({
        model: model || "unknown",
        modality: modalityForMode,
        prompt,
        maxTokens: settings.maxTokens,
        imageCount: settings.imageCount,
        seconds: settings.seconds,
      }),
    [model, modalityForMode, prompt, settings]
  );

  const credits = Math.max(1, Math.round(cost * CREDITS_PER_USD));
  const canSubmit = !!prompt.trim() && !!model && !busy;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ prompt: prompt.trim(), model, settings });
    setPrompt("");
  };

  return (
    <div
      className={[
        "rounded-2xl border border-[#2a2a2a] bg-[#161616] transition-all",
        expanded ? "min-h-[260px]" : "",
      ].join(" ")}
    >
      <div className="relative flex gap-3 px-4 pt-4">
        {(mode === "video" || mode === "image") && (
          <button
            type="button"
            className="group grid h-[74px] w-[74px] shrink-0 -rotate-3 place-items-center rounded-xl border border-dashed border-[#3a3a3a] bg-[#1f1f1f] text-[#9a9a9a] transition-colors hover:border-[#555] hover:text-white"
          >
            <IconPlus className="h-4 w-4" />
            <span className="mt-0.5 text-[11px]">素材</span>
          </button>
        )}

        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={PLACEHOLDER[mode]}
          rows={expanded ? 8 : 3}
          className="w-full resize-none bg-transparent pr-8 text-[14px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none"
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "收合" : "展開"}
          className="absolute right-4 top-4 text-[#7a7a7a] transition-colors hover:text-white"
        >
          <IconExpand className="h-4 w-4" />
        </button>
      </div>

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
                    close();
                  }}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#242424]">
                    <IconModel className="h-[15px] w-[15px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{m.id}</span>
                    <span className="block truncate text-[11.5px] text-[#7d7d7d]">{m.ownedBy}</span>
                  </span>
                  {m.id === model && <IconCheck className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </Popover>

        {/* generation settings */}
        <SettingsPopover mode={mode} settings={settings} onChange={setSettings} />

        <button type="button" aria-label="進階" className="bw-chip !px-2.5">
          <IconSettings className="h-[15px] w-[15px]" />
        </button>

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
