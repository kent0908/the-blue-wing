"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Composer from "@/components/Composer";
import JobQueue from "@/components/JobQueue";
import InspirationPanel from "@/components/InspirationPanel";
import ExpiringMedia from "@/components/ExpiringMedia";
import { IconCompass, IconHistory, IconDownload } from "@/components/Icons";
import { downloadResult } from "@/lib/download";
import type { GenSettings, Mode, PendingJob, ResultItem } from "@/lib/types";

/**
 * Parse a fetch Response as JSON. When the body isn't JSON (e.g. Vercel's
 * plain-text function-timeout page), surface a readable message instead of the
 * browser's "Unexpected token 'A'… is not valid JSON".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const timedOut =
      res.status === 502 ||
      res.status === 504 ||
      /timeout|timed out|FUNCTION_INVOCATION|error occurred/i.test(text);
    throw new Error(
      timedOut
        ? "生成逾時：這個模型在伺服器 60 秒函式上限內跑不完（gpt-image-2、gemini-3-pro-image 等較慢）。請改用較快的模型（Seedream 系列、Gemini Flash），或將 Vercel 專案升級為 Pro（函式上限 300 秒）。"
        : `伺服器回傳非 JSON 內容（HTTP ${res.status}）：${text.trim().slice(0, 160) || "（空白）"}`
    );
  }
}

/** Map an auth/credit failure to a call-to-action shown under the error. */
function ctaForStatus(status: number, mode: string): { href: string; label: string } | null {
  if (status === 401) return { href: `/login?next=${encodeURIComponent(`/studio?mode=${mode}`)}`, label: "前往登入" };
  if (status === 403) return { href: "/login", label: "完成 email 驗證後再登入" };
  if (status === 402) return { href: "/account", label: "查看方案 / 請管理員加點" };
  return null;
}

/**
 * Which 生成紀錄 kind belongs on-screen for a given composer mode. The main
 * viewer must never show a video while you're on the 圖片生成 tab (or vice
 * versa) just because it happens to be the most recent thing you generated
 * in some other mode — see modeForKind() for the reverse direction, used
 * when clicking a history thumbnail of the "wrong" kind.
 */
const KIND_FOR_MODE: Record<Mode, ResultItem["kind"]> = { image: "image", video: "video", text: "text", audio: "text" };
const MODE_FOR_KIND: Record<ResultItem["kind"], Mode> = { image: "image", video: "video", text: "text" };

/**
 * How many generations can be running at once. SIRAYA has no batch endpoint
 * (checked the docs — n only makes variations of the SAME prompt; there's no
 * "submit several different prompts in one call") — each submission is
 * already independent (video: async job id + its own poll loop; image: a
 * plain synchronous call), so "generate several at once" just means not
 * blocking new submissions on whichever one happens to be running. This cap
 * is a UI sanity limit, not a server-enforced one — it exists to stop a burst
 * of clicks from firing off more jobs than makes sense to track on screen.
 */
const MAX_CONCURRENT_JOBS = 4;

function sizeFromRatio(ratio: string, fallback: string) {
  const map: Record<string, string> = {
    "1:1": "1024x1024",
    "3:4": "1024x1365",
    "4:3": "1365x1024",
    "9:16": "1024x1792",
    "16:9": "1792x1024",
    "21:9": "1792x768",
  };
  return map[ratio] ?? fallback;
}

let jobSeq = 0;
function newJobId() {
  jobSeq += 1;
  return `job_${Date.now().toString(36)}_${jobSeq}`;
}

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
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  // Which history item the main viewer shows. null = "the newest one" (the
  // BUG this fixes: clicking a 生成紀錄 thumbnail previously did nothing —
  // there was no way to bring an older result back into the main viewer).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Guards state updates from a poll loop that outlives the component (route
  // change, tab close mid-generation) — several loops can be in flight at
  // once now, so this is a single shared flag rather than per-job timers.
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  const setMode = (m: Mode) => router.push(`/studio?mode=${m}`);

  const pushResult = useCallback((r: ResultItem) => {
    if (unmountedRef.current) return;
    setResults((prev) => [r, ...prev]);
    setSelectedId(null); // jump the main viewer back to "newest" for the new result
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<PendingJob>) => {
    if (unmountedRef.current) return;
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const removeJob = useCallback((id: string) => {
    if (unmountedRef.current) return;
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  // Seed 生成紀錄 from the DB so it survives reloads / different devices,
  // instead of only holding whatever happened in this browser tab's session.
  // 401 (logged out) just leaves history empty — not an error worth surfacing here.
  useEffect(() => {
    fetch("/api/generations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { generations?: ResultItem[] } | null) => {
        if (j?.generations?.length) setResults(j.generations);
      })
      .catch(() => {});
  }, []);

  const pollVideoJob = useCallback(
    async (jobId: string, videoId: string, prompt: string, model: string) => {
      for (let i = 0; i < 200; i++) {
        if (unmountedRef.current) return;
        await new Promise((r) => setTimeout(r, 4000));
        if (unmountedRef.current) return;
        const qs = new URLSearchParams({ model, prompt });
        const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}?${qs.toString()}`);
        const json = await readJson(res);
        if (!res.ok) throw new Error(json?.error?.message || "查詢影片狀態失敗");
        if (json.status === "completed" && json.url) {
          pushResult({ id: `${videoId}`, kind: "video", url: json.url, prompt, model, createdAt: Date.now() });
          removeJob(jobId);
          setPanelOpen(true);
          return;
        }
        if (json.status === "failed") throw new Error("影片生成失敗");
        updateJob(jobId, { stage: 2 });
      }
      throw new Error("影片生成逾時，請稍後到生成紀錄查看");
    },
    [pushResult, removeJob, updateJob]
  );

  /** Runs one generation job to completion. Fire-and-forget from handleSubmit
   *  — several of these run concurrently, each tracked by its own job id. */
  const runJob = useCallback(
    async (
      jobId: string,
      jobMode: Mode,
      {
        prompt,
        model,
        settings,
        imagePayload,
        assetIds,
        extraBody,
      }: {
        prompt: string;
        model: string;
        settings: GenSettings;
        imagePayload?: Record<string, unknown>;
        assetIds?: number[];
        extraBody?: Record<string, unknown>;
      }
    ) => {
      try {
        updateJob(jobId, { stage: 1 });

        if (jobMode === "video") {
          const res = await fetch("/api/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              prompt,
              seconds: settings.seconds,
              resolution: settings.resolution,
              ...(settings.aspectRatio !== "auto" ? { aspect_ratio: settings.aspectRatio } : {}),
              ...(assetIds?.length ? { assetIds } : {}),
              ...(extraBody ? { extra_body: extraBody } : {}),
            }),
          });
          const json = await readJson(res);
          if (!res.ok) {
            updateJob(jobId, { error: json?.error?.message || "影片生成請求失敗", errorCta: ctaForStatus(res.status, jobMode) });
            return;
          }
          if (json.status === "completed" && json.url) {
            pushResult({ id: json.id ?? String(Date.now()), kind: "video", url: json.url, prompt, model, createdAt: Date.now() });
            removeJob(jobId);
            setPanelOpen(true);
          } else if (json.id) {
            await pollVideoJob(jobId, json.id, prompt, model);
          } else {
            updateJob(jobId, { error: "API 沒有回傳影片 id 或網址" });
          }
          return;
        }

        if (jobMode === "image") {
          const body = imagePayload ?? {
            model,
            prompt,
            n: settings.imageCount,
            size: sizeFromRatio(settings.aspectRatio, settings.size),
            response_format: "url",
          };
          const res = await fetch("/api/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await readJson(res);
          if (!res.ok) {
            updateJob(jobId, { error: json?.error?.message || "圖片生成請求失敗", errorCta: ctaForStatus(res.status, jobMode) });
            return;
          }
          updateJob(jobId, { stage: 3 });
          let any = false;
          (json.images ?? []).forEach((img: { url: string | null }, i: number) => {
            if (img.url) {
              pushResult({ id: `${Date.now()}-${i}`, kind: "image", url: img.url, prompt, model, createdAt: Date.now() });
              any = true;
            }
          });
          removeJob(jobId);
          if (any) setPanelOpen(true);
          return;
        }

        // text / audio fall back to chat completions
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: settings.maxTokens,
          }),
        });
        const json = await readJson(res);
        if (!res.ok) {
          updateJob(jobId, { error: json?.error?.message || "文字生成請求失敗", errorCta: ctaForStatus(res.status, jobMode) });
          return;
        }
        updateJob(jobId, { stage: 3 });
        const text = json?.choices?.[0]?.message?.content ?? "";
        pushResult({ id: String(Date.now()), kind: "text", text, prompt, model, createdAt: Date.now() });
        removeJob(jobId);
        setPanelOpen(true);
      } catch (e) {
        updateJob(jobId, { error: e instanceof Error ? e.message : "發生未預期的錯誤" });
      }
    },
    [pollVideoJob, pushResult, removeJob, updateJob]
  );

  const handleSubmit = (args: {
    prompt: string;
    model: string;
    settings: GenSettings;
    imagePayload?: Record<string, unknown>;
    assetIds?: number[];
    extraBody?: Record<string, unknown>;
  }) => {
    if (jobs.length >= MAX_CONCURRENT_JOBS) return; // submit button is disabled at this point too
    const jobId = newJobId();
    const kind = mode === "video" ? "video" : mode === "image" ? "image" : "text";
    setJobs((prev) => [...prev, { id: jobId, mode, kind, model: args.model, prompt: args.prompt, startedAt: Date.now(), stage: 0 }]);
    void runJob(jobId, mode, args);
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
            <JobQueue jobs={jobs} onDismiss={removeJob} />
            {atCapacity && (
              <p className="mb-2 text-center text-[11.5px] text-[#f0c27f]">
                同時最多 {MAX_CONCURRENT_JOBS} 個生成在跑，等其中一個完成才能再送出
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
