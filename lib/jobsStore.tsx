"use client";

/**
 * Generation jobs live here — at the ROOT layout, not inside /studio's page
 * component — specifically so a generation keeps running (and gets recorded)
 * when you navigate to another page mid-generation. Previously this state
 * lived in app/studio/page.tsx; navigating away unmounted it, which didn't
 * just stop the UI updating — for async video jobs it stopped the poll loop
 * outright, so the video would finish server-side, credits already spent,
 * but never get written to 生成紀錄 because nothing was left polling
 * /api/videos/[id] to notice it had completed.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { GenSettings, Mode, PendingJob, ResultItem } from "./types";

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

function ctaForStatus(status: number, mode: string): { href: string; label: string } | null {
  if (status === 401) return { href: `/login?next=${encodeURIComponent(`/studio?mode=${mode}`)}`, label: "前往登入" };
  if (status === 403) return { href: "/login", label: "完成 email 驗證後再登入" };
  if (status === 402) return { href: "/account", label: "查看方案 / 請管理員加點" };
  return null;
}

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

const KIND_FOR_MODE: Record<Mode, ResultItem["kind"]> = { image: "image", video: "video", text: "text", audio: "text" };

/** See app/studio/page.tsx's original note: SIRAYA has no batch endpoint —
 *  this is a UI sanity cap, not a server-enforced one. */
export const MAX_CONCURRENT_JOBS = 4;

let seq = 0;
function newId(prefix: string) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export interface SubmitArgs {
  prompt: string;
  model: string;
  settings: GenSettings;
  imagePayload?: Record<string, unknown>;
  assetIds?: number[];
  extraBody?: Record<string, unknown>;
}

export interface ToastItem {
  id: string;
  ok: boolean;
  mode: Mode;
  title: string;
  detail: string;
}

interface JobsContextValue {
  jobs: PendingJob[];
  results: ResultItem[];
  toasts: ToastItem[];
  startJob: (mode: Mode, args: SubmitArgs) => void;
  dismissJob: (id: string) => void;
  dismissToast: (id: string) => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export function useGenerationJobs(): JobsContextValue {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useGenerationJobs() must be used within <GenerationJobsProvider>");
  return ctx;
}

export function GenerationJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // The provider itself only unmounts on a full page reload, but keep the
  // guard anyway — cheap, and protects against React strict-mode double
  // effects / future refactors that might remount it.
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  // Seed 生成紀錄 once for the whole session, instead of every time /studio
  // happens to mount.
  useEffect(() => {
    fetch("/api/generations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { generations?: ResultItem[] } | null) => {
        if (j?.generations?.length) setResults(j.generations);
      })
      .catch(() => {});
  }, []);

  const pushResult = useCallback((r: ResultItem) => {
    if (unmountedRef.current) return;
    setResults((prev) => [r, ...prev]);
  }, []);

  const pushToast = useCallback((t: Omit<ToastItem, "id">) => {
    if (unmountedRef.current) return;
    const id = newId("toast");
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 7000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<PendingJob>) => {
    if (unmountedRef.current) return;
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const dismissJob = useCallback((id: string) => {
    if (unmountedRef.current) return;
    setJobs((prev) => prev.filter((j) => j.id !== id));
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
          pushToast({ ok: true, mode: "video", title: "影片生成完成", detail: prompt });
          dismissJob(jobId);
          return;
        }
        if (json.status === "failed") throw new Error("影片生成失敗");
        updateJob(jobId, { stage: 2 });
      }
      throw new Error("影片生成逾時，請稍後到生成紀錄查看");
    },
    [dismissJob, pushResult, pushToast, updateJob]
  );

  /** Runs one generation job to completion. Fire-and-forget from startJob —
   *  several of these run concurrently, each tracked by its own job id, and
   *  none of them depend on any page still being mounted to finish. */
  const runJob = useCallback(
    async (jobId: string, jobMode: Mode, { prompt, model, settings, imagePayload, assetIds, extraBody }: SubmitArgs) => {
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
            const message = json?.error?.message || "影片生成請求失敗";
            updateJob(jobId, { error: message, errorCta: ctaForStatus(res.status, jobMode) });
            pushToast({ ok: false, mode: jobMode, title: "影片生成失敗", detail: message });
            return;
          }
          if (json.status === "completed" && json.url) {
            pushResult({ id: json.id ?? String(Date.now()), kind: "video", url: json.url, prompt, model, createdAt: Date.now() });
            pushToast({ ok: true, mode: "video", title: "影片生成完成", detail: prompt });
            dismissJob(jobId);
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
            const message = json?.error?.message || "圖片生成請求失敗";
            updateJob(jobId, { error: message, errorCta: ctaForStatus(res.status, jobMode) });
            pushToast({ ok: false, mode: jobMode, title: "圖片生成失敗", detail: message });
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
          dismissJob(jobId);
          if (any) pushToast({ ok: true, mode: "image", title: "圖片生成完成", detail: prompt });
          return;
        }

        // text / audio fall back to chat completions
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: settings.maxTokens }),
        });
        const json = await readJson(res);
        if (!res.ok) {
          const message = json?.error?.message || "文字生成請求失敗";
          updateJob(jobId, { error: message, errorCta: ctaForStatus(res.status, jobMode) });
          pushToast({ ok: false, mode: jobMode, title: "生成失敗", detail: message });
          return;
        }
        updateJob(jobId, { stage: 3 });
        const text = json?.choices?.[0]?.message?.content ?? "";
        pushResult({ id: String(Date.now()), kind: "text", text, prompt, model, createdAt: Date.now() });
        pushToast({ ok: true, mode: jobMode, title: "生成完成", detail: prompt });
        dismissJob(jobId);
      } catch (e) {
        const message = e instanceof Error ? e.message : "發生未預期的錯誤";
        updateJob(jobId, { error: message });
        pushToast({ ok: false, mode: jobMode, title: "生成失敗", detail: message });
      }
    },
    [dismissJob, pollVideoJob, pushResult, pushToast, updateJob]
  );

  const startJob = useCallback(
    (jobMode: Mode, args: SubmitArgs) => {
      if (jobs.length >= MAX_CONCURRENT_JOBS) return; // submit button is disabled at this point too
      const jobId = newId("job");
      setJobs((prev) => [
        ...prev,
        { id: jobId, mode: jobMode, kind: KIND_FOR_MODE[jobMode], model: args.model, prompt: args.prompt, startedAt: Date.now(), stage: 0 },
      ]);
      void runJob(jobId, jobMode, args);
    },
    [jobs.length, runJob]
  );

  return (
    <JobsContext.Provider value={{ jobs, results, toasts, startJob, dismissJob, dismissToast }}>{children}</JobsContext.Provider>
  );
}
