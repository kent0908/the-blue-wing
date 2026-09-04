"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Composer from "@/components/Composer";
import JobQueue from "@/components/JobQueue";
import InspirationPanel from "@/components/InspirationPanel";
import ExpiringMedia from "@/components/ExpiringMedia";
import { IconCompass, IconHistory, IconDownload } from "@/components/Icons";
import { downloadResult } from "@/lib/download";
import { useGenerationJobs, MAX_CONCURRENT_JOBS } from "@/lib/jobsStore";
import type { GenSettings, Mode, ResultItem } from "@/lib/types";

/**
 * Which 生成紀錄 kind belongs on-screen for a given composer mode. The main
 * viewer must never show a video while you're on the 圖片生成 tab (or vice
 * versa) just because it happens to be the most recent thing you generated
 * in some other mode — see modeForKind() for the reverse direction, used
 * when clicking a history thumbnail of the "wrong" kind.
 */
const KIND_FOR_MODE: Record<Mode, ResultItem["kind"]> = { image: "image", video: "video", text: "text", audio: "text" };
const MODE_FOR_KIND: Record<ResultItem["kind"], Mode> = { image: "image", video: "video", text: "text" };

function StudioInner() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = (params.get("mode") as Mode) || "video";
  const urlModel = params.get("model") ?? undefined;
  const urlPrompt = params.get("q") ?? undefined;
  const preset = params.get("preset");

  // Template presets carry prompt / model / params / a reference image. Resolve
  // them before mounting the Composer so its initial state is already populated.
  const [presetReady, setPresetReady] = useState(!preset);
  const [presetModel, setPresetModel] = useState<string | undefined>(urlModel);
  const [presetPrompt, setPresetPrompt] = useState<string | undefined>(urlPrompt);
  const [presetImgValues, setPresetImgValues] = useState<Record<string, string | number> | undefined>();
  const [presetRefs, setPresetRefs] = useState<{ id: number; src: string; name: string }[] | undefined>();

  useEffect(() => {
    if (!preset) return;
    let alive = true;
    (async () => {
      try {
        const j = await fetch("/api/home-blocks").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const all = j ? [...(j.hero ?? []), ...(j.showcase ?? []), ...(j.template ?? [])] : [];
        const b = all.find((x: { id: number }) => String(x.id) === preset);
        if (b && alive) {
          if (b.prompt && !urlPrompt) setPresetPrompt(b.prompt);
          if (b.modelId && !urlModel) setPresetModel(b.modelId);
          if (b.params && typeof b.params === "object") setPresetImgValues(b.params);
        }
        if (b?.hasImage) {
          const t = await fetch("/api/templates/use", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId: Number(preset) }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (alive && t?.ref) setPresetRefs([{ id: t.ref.id, src: t.ref.src, name: t.ref.name ?? "範本圖片" }]);
        }
      } finally {
        if (alive) setPresetReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [preset, urlModel, urlPrompt]);

  const [panelOpen, setPanelOpen] = useState(false);
  // Which history item the main viewer shows. null = "the newest one" (the
  // BUG this fixes: clicking a 生成紀錄 thumbnail previously did nothing —
  // there was no way to bring an older result back into the main viewer).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Jobs/results live at the root layout now, not in this page — a
  // generation keeps running (and gets recorded) when you navigate away
  // mid-generation, and a toast shows the result wherever you end up. See
  // lib/jobsStore.tsx.
  const { jobs, results, startJob, dismissJob } = useGenerationJobs();

  const setMode = (m: Mode) => router.push(`/studio?mode=${m}`);

  const handleSubmit = (args: {
    prompt: string;
    model: string;
    settings: GenSettings;
    imagePayload?: Record<string, unknown>;
    assetIds?: number[];
    extraBody?: Record<string, unknown>;
  }) => {
    startJob(mode, args);
  };

  // Main viewer is scoped to the current mode's kind — 圖片生成 only ever
  // shows images, 影片生成 only ever shows videos, even though 生成紀錄 itself
  // (the panel on the right) still lists everything mixed together.
  const resultsForMode = results.filter((r) => r.kind === KIND_FOR_MODE[mode]);
  const latest = (selectedId ? resultsForMode.find((r) => r.id === selectedId) : null) ?? resultsForMode[0];
  const atCapacity = jobs.length >= MAX_CONCURRENT_JOBS;

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute right-6 top-4 z-20 flex items-center gap-1 rounded-full bg-[#141414]/90 p-1 backdrop-blur">
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-[#c9c9c9] transition-colors hover:bg-[#222] hover:text-white"
          >
            <IconCompass className="h-4 w-4" />
            靈感廣場
          </button>
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-[#c9c9c9] transition-colors hover:bg-[#222] hover:text-white"
          >
            <IconHistory className="h-4 w-4" />
            生成紀錄
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 pt-16">
          {latest ? (
            // Keyed by id so switching to a different result remounts fresh —
            // resets this item's own "did its media fail to load" state
            // without needing a parent effect to sync it back to false.
            <MainViewerItem key={latest.id} item={latest} />
          ) : jobs.length === 0 ? (
            <h2 className="text-[34px] font-normal text-[#5c5c5c]">用 The Blue Wing 點亮你的創作</h2>
          ) : null}
        </div>

        <div className="px-8 pb-8">
          <div className="mx-auto w-full max-w-[840px]">
            <JobQueue jobs={jobs} onDismiss={dismissJob} />
            {atCapacity && (
              <p className="mb-2 text-center text-[11.5px] text-[#f0c27f]">
                同時最多 {MAX_CONCURRENT_JOBS} 個生成在跑（不限模式），等其中一個完成才能再送出
              </p>
            )}
            {presetReady ? (
              <Composer
                mode={mode}
                onModeChange={setMode}
                onSubmit={handleSubmit}
                busy={atCapacity}
                initialModel={presetModel}
                initialPrompt={presetPrompt}
                initialImgValues={presetImgValues}
                initialRefs={presetRefs}
              />
            ) : (
              <div className="h-[168px] rounded-2xl border border-[#2a2a2a] bg-[#161616] bw-shimmer" />
            )}
          </div>
        </div>
      </div>

      {panelOpen && (
        <InspirationPanel
          history={results}
          selectedId={latest?.id ?? null}
          onSelect={(item) => {
            // clicking a video while on 圖片生成 (etc.) switches the tab too —
            // otherwise the click would silently do nothing, since the main
            // viewer never shows a result whose kind doesn't match the mode.
            const wantMode = MODE_FOR_KIND[item.kind];
            if (wantMode !== mode) router.push(`/studio?mode=${wantMode}`);
            setSelectedId(item.id);
          }}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

function MainViewerItem({ item }: { item: ResultItem }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="w-full max-w-3xl py-8">
      <div className="relative">
        {(item.kind === "image" || item.kind === "video") && item.url && (
          <ExpiringMedia
            kind={item.kind}
            url={item.url}
            alt={item.prompt}
            controls={item.kind === "video"}
            className="mx-auto max-h-[60vh] rounded-xl"
            fallbackClassName="mx-auto flex h-[300px] w-full max-w-md flex-col items-center justify-center gap-2 rounded-xl bg-[#141414] text-[#6d6d6d]"
            onBroken={() => setBroken(true)}
          />
        )}
        {item.kind === "text" && (
          <div className="whitespace-pre-wrap rounded-xl bg-[#141414] p-6 text-[14px] leading-relaxed">{item.text}</div>
        )}
        {item.url && !broken && (
          <button
            type="button"
            onClick={() => downloadResult(item)}
            title="下載"
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12.5px] text-white backdrop-blur transition-colors hover:bg-black/80"
          >
            <IconDownload className="h-4 w-4" />
            下載
          </button>
        )}
      </div>
      <p className="mt-4 text-center text-[12.5px] text-[#6d6d6d]">
        {item.model} · {item.prompt}
      </p>
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <StudioInner />
    </Suspense>
  );
}
