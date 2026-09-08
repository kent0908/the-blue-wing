"use client";

import LayerDecompositionResult from "@/components/LayerDecompositionResult";
import { modelLabel } from "@/lib/modelLabel";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Composer from "@/components/Composer";
import JobQueue, { Elapsed, KIND_ICON, STAGE_LABEL } from "@/components/JobQueue";
import InspirationPanel from "@/components/InspirationPanel";
import ExpiringMedia from "@/components/ExpiringMedia";
import { IconCompass, IconHistory, IconDownload, IconClose, IconCollapse } from "@/components/Icons";
import { downloadResult } from "@/lib/download";
import { useGenerationJobs, MAX_CONCURRENT_JOBS } from "@/lib/jobsStore";
import { mainViewerJob, runningJobCount } from "@/lib/jobVisibility";
import { DIRECTOR3D_HANDOFF_KEY } from "@/lib/canvas/director3d";
import type { GenSettings, Mode, PendingJob, ResultItem } from "@/lib/types";

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

  // A screenshot (or a recorded 運鏡's sampled frames) handed off from the
  // standalone 3D導演台 page (see app/canvas/director3d/page.tsx) — it
  // already uploaded the capture(s) to the asset library before navigating
  // here, so this is just picking the resulting {id,src,name}[] back up
  // (the same shape a template preset's reference image uses), plus an
  // optional auto-generated camera-move prompt hint. Read once, since the
  // sessionStorage key is consumed (removed) on first read.
  const [director3dHandoff] = useState<{
    refs: { id: number; src: string; name: string }[];
    promptHint?: string;
    videoRef?: { url: string };
  } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(DIRECTOR3D_HANDOFF_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(DIRECTOR3D_HANDOFF_KEY);
      return JSON.parse(raw) as { refs: { id: number; src: string; name: string }[]; promptHint?: string; videoRef?: { url: string } };
    } catch {
      return null;
    }
  });

  // Template presets carry prompt / model / params / a reference image. Resolve
  // them before mounting the Composer so its initial state is already populated.
  const [presetReady, setPresetReady] = useState(!preset);
  const [presetModel, setPresetModel] = useState<string | undefined>(urlModel);
  const [presetPrompt, setPresetPrompt] = useState<string | undefined>(urlPrompt ?? director3dHandoff?.promptHint);
  const [presetImgValues, setPresetImgValues] = useState<Record<string, string | number> | undefined>();
  const [presetRefs, setPresetRefs] = useState<{ id: number; src: string; name: string }[] | undefined>(director3dHandoff?.refs);
  const [presetVideoRef] = useState(director3dHandoff?.videoRef);

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

  // A running job for the current mode shows big in the main viewer by
  // default — the very first version's behaviour, and the one that
  // actually surfaces an error or "what stage is this at" without having
  // to notice the small strip below the composer. "縮小" collapses just
  // that one job back down to the strip. Older failures stay in that queue
  // when newer work is running or has already produced a result.
  const [minimizedJobIds, setMinimizedJobIds] = useState<Set<string>>(new Set());
  const minimizeJob = (id: string) => setMinimizedJobIds((s) => new Set(s).add(id));

  const setMode = (m: Mode) => router.push(`/studio?mode=${m}`);

  const handleSubmit = (args: {
    prompt: string;
    model: string;
    settings: GenSettings;
    imagePayload?: Record<string, unknown>;
    assetIds?: number[];
  generationMode?: string;
  providerAssetIds?: number[];
    extraBody?: Record<string, unknown>;
    videoUrl?: string;
  }) => {
    startJob(mode, args);
  };

  // Main viewer is scoped to the current mode's kind — 圖片生成 only ever
  // shows images, 影片生成 only ever shows videos, even though 生成紀錄 itself
  // (the panel on the right) still lists everything mixed together.
  const resultsForMode = results.filter((r) => r.kind === KIND_FOR_MODE[mode]);
  const latest = (selectedId ? resultsForMode.find((r) => r.id === selectedId) : null) ?? resultsForMode[0];
  const atCapacity = runningJobCount(jobs) >= MAX_CONCURRENT_JOBS;
  const activeJob = mainViewerJob(jobs, mode, minimizedJobIds, resultsForMode[0]?.createdAt, Boolean(selectedId));

  return (
    <div className="relative flex h-full min-h-0">
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

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-3 pt-16 lg:px-5">
          {activeJob ? (
            <ActiveJobCard job={activeJob} onMinimize={() => minimizeJob(activeJob.id)} onDismiss={() => dismissJob(activeJob.id)} />
          ) : latest ? (
            // Keyed by id so switching to a different result remounts fresh —
            // resets this item's own "did its media fail to load" state
            // without needing a parent effect to sync it back to false.
            <MainViewerItem key={latest.id} item={latest} />
          ) : jobs.length === 0 ? (
            <h2 className="text-center text-xl sm:text-[34px] font-normal text-[#5c5c5c]">用 The Blue Wing 點亮你的創作</h2>
          ) : null}
        </div>

        <div className="px-3 pb-4 lg:px-5 sm:pb-8">
          <div className="w-full">
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
                initialModel={urlModel ?? presetModel}
                initialPrompt={presetPrompt}
                initialImgValues={presetImgValues}
                initialRefs={presetRefs}
                initialVideoRef={presetVideoRef}
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

/**
 * The current mode's active job, shown big in the main viewer instead of
 * tucked into the small strip below the composer — see the note on
 * `activeJob` above for why. Mirrors JobQueue's own error/running visuals,
 * just at a size where a stage label or an error message actually reads as
 * "something is happening" rather than something you'd have to go looking
 * for.
 */
function ActiveJobCard({ job, onMinimize, onDismiss }: { job: PendingJob; onMinimize: () => void; onDismiss: () => void }) {
  const Icon = KIND_ICON[job.kind];
  if (job.error) {
    return (
      <div className="w-full max-w-lg rounded-2xl border border-[#4a2020] bg-[#1a1010] p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#2a1616] text-[22px] text-[#ff8a8a]">!</div>
        <p className="text-[14px] leading-relaxed text-[#ff9b9b]">{job.error}</p>
        {job.errorCta && (
          <Link href={job.errorCta.href} className="mt-2 inline-block text-[12.5px] text-[#7ff0cd] hover:underline">
            {job.errorCta.label}
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="mx-auto mt-4 flex items-center gap-1.5 rounded-full bg-[#242424] px-4 py-1.5 text-[12.5px] text-white hover:bg-[#2e2e2e]"
        >
          <IconClose className="h-3.5 w-3.5" />
          關閉
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-lg rounded-2xl border border-[#2a2a2a] bg-[#141414] p-8 text-center">
      <button
        type="button"
        onClick={onMinimize}
        title="縮小（生成不會中斷，改用下面的小卡片顯示）"
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-[#6d6d6d] hover:bg-[#1f1f1f] hover:text-white"
      >
        <IconCollapse className="h-4 w-4" />
      </button>
      <span className="relative mx-auto mb-4 grid h-14 w-14 place-items-center">
        <span className="absolute inset-0 rounded-full border border-[#7ff0cd]/50 bw-pulse-ring" />
        <Icon className="h-6 w-6 text-[#7ff0cd]" />
      </span>
      <p className="text-[14px] text-white">{job.prompt || modelLabel(job.model)}</p>
      <p className="mt-2 text-[12.5px] text-[#7d7d7d]">
        {STAGE_LABEL[Math.min(job.stage, STAGE_LABEL.length - 1)]} · <Elapsed startedAt={job.startedAt} />
      </p>
    </div>
  );
}

function MainViewerItem({ item }: { item: ResultItem }) {
  const [broken, setBroken] = useState(false);
  if(item.layerSetId) return <LayerDecompositionResult id={item.layerSetId}/>;
  return (
    <div className="w-full py-8">
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
        {modelLabel(item.model)} · {item.prompt}
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

