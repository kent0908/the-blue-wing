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
import { videoConstraintFor } from "./videoModels";
import { runningJobCount } from "./jobVisibility";

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

/**
 * A video job is the one kind that can outlive the page it was started on
 * even without reloading — SIRAYA keeps rendering it for minutes after
 * submission, and the whole point of jobsStore living at the root layout is
 * that a client-side navigation doesn't kill the poll loop. A full page
 * *reload* (F5, closing and reopening the tab) does, though — React state
 * is gone either way. Real incident that prompted this: several submitted,
 * charged, genuinely-completed-on-SIRAYA's-side videos never showed up in
 * 生成紀錄 because nothing was left polling after a reload; recovered by
 * manually re-polling each one. Persisting the handful of fields needed to
 * resume polling to localStorage — and resuming them on mount — means a
 * reload doesn't orphan a job that's still cooking server-side.
 */
interface PendingVideoRecord {
  jobId: string;
  videoId: string;
  mode: Mode;
  model: string;
  prompt: string;
}
const PENDING_VIDEOS_KEY = "bw:pending-videos";

function readPendingVideos(): PendingVideoRecord[] {
  try {
    const raw = localStorage.getItem(PENDING_VIDEOS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingVideo(rec: PendingVideoRecord) {
  try {
    const cur = readPendingVideos().filter((r) => r.videoId !== rec.videoId);
    localStorage.setItem(PENDING_VIDEOS_KEY, JSON.stringify([...cur, rec]));
  } catch {
    // best-effort resumability only — a full/blocked storage quota shouldn't break generating
  }
}

function removePendingVideo(videoId: string) {
  try {
    localStorage.setItem(PENDING_VIDEOS_KEY, JSON.stringify(readPendingVideos().filter((r) => r.videoId !== videoId)));
  } catch {
    // see writePendingVideo
  }
}

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
  generationMode?: string;
  providerAssetIds?: number[];
  extraBody?: Record<string, unknown>;
  /** a recorded 3D導演台 運鏡 clip's URL — video mode + Seedance 2.0/2.5 only, see lib/videoModels.ts */
  videoUrl?: string;
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
  // Seed any video job that was still polling when the page last unloaded
  // (see PendingVideoRecord's comment) directly into the initial state,
  // rather than reading localStorage + setJobs inside a mount effect — same
  // outcome, but a lazy initializer doesn't trigger an extra synchronous
  // render the way setState-in-an-effect does.
  const [jobs, setJobs] = useState<PendingJob[]>(() =>
    readPendingVideos().map((rec) => ({
      id: rec.jobId,
      mode: rec.mode,
      kind: "video" as const,
      model: rec.model,
      prompt: rec.prompt,
      startedAt: Date.now(),
      stage: 2,
    }))
  );
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
    async (jobId: string, videoId: string, prompt: string, model: string, startedAt: number = Date.now()) => {
      // Recorded so a reload mid-poll can resume this exact job instead of
      // orphaning it — see the module comment on PendingVideoRecord. Every
      // exit path below (success / failure / timeout / thrown error) removes
      // it again.
      writePendingVideo({ jobId, videoId, mode: "video", model, prompt });
      // Real incident (2026-09-06): a single failed poll — a network blip, a
      // transient 5xx from SIRAYA's own status endpoint, a brief DB hiccup in
      // our own /api/videos/[id] — used to throw immediately and abandon the
      // job for good right here. The video itself keeps rendering server-side
      // regardless; credits were already charged at submission; with nothing
      // left polling, a genuinely-successful render would finish with no one
      // around to notice, record it, or (since SIRAYA never actually reported
      // "failed") refund it — charged, nothing to show for it, exactly the
      // "有扣款但沒有任何影片生成成功" pattern reported by a real user. Only
      // a *run* of consecutive poll failures — not one — should give up.
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 6; // ~24s of tolerated trouble at the 4s poll interval below
      try {
        for (let i = 0; i < 200; i++) {
          if (unmountedRef.current) return;
          await new Promise((r) => setTimeout(r, 4000));
          if (unmountedRef.current) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let json: any;
          try {
            const qs = new URLSearchParams({ model, prompt });
            const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}?${qs.toString()}`);
            json = await readJson(res);
            if (!res.ok) throw new Error(json?.error?.message || `查詢影片狀態失敗（HTTP ${res.status}）`);
          } catch (e) {
            consecutiveErrors += 1;
            if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) throw e;
            continue; // transient — try again on the next tick instead of giving up
          }
          consecutiveErrors = 0;
          if (json.status === "completed" && json.url) {
            pushResult({ id: `${videoId}`, kind: "video", url: json.url, prompt, model, createdAt: Date.now(), durationMs: Date.now() - startedAt });
            pushToast({ ok: true, mode: "video", title: "影片生成完成", detail: prompt });
            dismissJob(jobId);
            return;
          }
          if (json.status === "failed") throw new Error("影片生成失敗");
          updateJob(jobId, { stage: 2 });
        }
        throw new Error("影片生成逾時，請稍後到生成紀錄查看");
      } finally {
        removePendingVideo(videoId);
      }
    },
    [dismissJob, pushResult, pushToast, updateJob]
  );

  // The jobs themselves are already seeded into initial state above; this
  // just (re-)starts the actual polling for each one — a real side effect
  // (kicking off async work), not a state sync, so it belongs in an effect
  // rather than the lazy initializer.
  useEffect(() => {
    for (const rec of readPendingVideos()) {
      void pollVideoJob(rec.jobId, rec.videoId, rec.prompt, rec.model).catch((e) => {
        const message = e instanceof Error ? e.message : "發生未預期的錯誤";
        updateJob(rec.jobId, { error: message });
        pushToast({ ok: false, mode: rec.mode, title: "影片生成失敗", detail: message });
      });
    }
    // mount-only — deliberately not re-run per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Runs one generation job to completion. Fire-and-forget from startJob —
   *  several of these run concurrently, each tracked by its own job id, and
   *  none of them depend on any page still being mounted to finish. */
  const runJob = useCallback(
    async (jobId: string, jobMode: Mode, { prompt, model, settings, imagePayload, assetIds, extraBody, videoUrl, generationMode, providerAssetIds }: SubmitArgs) => {
      const startedAt = Date.now();
      try {
        updateJob(jobId, { stage: 1 });

        if (jobMode === "video") {
          // Defensive clamp, not just the Composer's own settings UI: every
          // Seedance version has its own real resolution/duration ceiling
          // (see lib/videoModels.ts's videoConstraintFor — found via a real
          // audit against SIRAYA, 2026-09-06), and `settings` can carry a
          // value picked for a DIFFERENT model (e.g. 1080p/30s from
          // Seedance 2.5) into a submission against a narrower one (e.g.
          // 2.0-mini only goes to 720p/15s) if the UI state wasn't perfectly
          // in sync when the model was switched. Whatever the UI showed,
          // the actual request sent here is always valid for `model`.
          const constraint = videoConstraintFor(model);
          const resolution = constraint.resolutions.includes(settings.resolution) ? settings.resolution : constraint.resolutions[0];
          const seconds = Math.min(settings.seconds, constraint.maxSeconds);
          const res = await fetch("/api/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              prompt,
              seconds,
              resolution,
              ...(settings.aspectRatio !== "auto" ? { aspect_ratio: settings.aspectRatio } : {}),
              ...(assetIds?.length ? { assetIds } : {}),
              ...(generationMode ? { generationMode } : {}),
              ...(providerAssetIds?.length ? { providerAssetIds } : {}),
              ...(extraBody ? { extra_body: extraBody } : {}),
              ...(videoUrl ? { videoUrl } : {}),
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
            pushResult({ id: json.id ?? String(Date.now()), kind: "video", url: json.url, prompt, model, createdAt: Date.now(), durationMs: Date.now() - startedAt });
            pushToast({ ok: true, mode: "video", title: "影片生成完成", detail: prompt });
            dismissJob(jobId);
          } else if (json.id) {
            await pollVideoJob(jobId, json.id, prompt, model, startedAt);
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
          if(json.layerSetId){
            const base = (json.layers??[]).find((layer:{z_index:number})=>layer.z_index===0);
            pushResult({id:`layers-${json.layerSetId}`,kind:"image",url:base?.url,layerSetId:json.layerSetId,prompt,model,createdAt:Date.now()});
            dismissJob(jobId);
            pushToast({ok:true,mode:"image",title:"圖層分離完成",detail:`實扣 ${json.creditsSpent} 點，退回 ${json.creditsRefunded} 點`});
            return;
          }
          (json.images ?? []).forEach((img: { url: string | null }, i: number) => {
            if (img.url) {
              pushResult({ id: `${Date.now()}-${i}`, kind: "image", url: img.url, prompt, model, createdAt: Date.now(), durationMs: Date.now() - startedAt });
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
        pushResult({ id: String(Date.now()), kind: "text", text, prompt, model, createdAt: Date.now(), durationMs: Date.now() - startedAt });
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
      if (runningJobCount(jobs) >= MAX_CONCURRENT_JOBS) return;
      const jobId = newId("job");
      setJobs((prev) => [
        ...prev,
        { id: jobId, mode: jobMode, kind: KIND_FOR_MODE[jobMode], model: args.model, prompt: args.prompt, startedAt: Date.now(), stage: 0 },
      ]);
      void runJob(jobId, jobMode, args);
    },
    [jobs, runJob]
  );

  return (
    <JobsContext.Provider value={{ jobs, results, toasts, startJob, dismissJob, dismissToast }}>{children}</JobsContext.Provider>
  );
}
