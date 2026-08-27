"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Composer from "@/components/Composer";
import GenerationProgress from "@/components/GenerationProgress";
import InspirationPanel from "@/components/InspirationPanel";
import { IconCompass, IconHistory } from "@/components/Icons";
import type { GenSettings, Mode, ResultItem } from "@/lib/types";

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

function StudioInner() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = (params.get("mode") as Mode) || "video";
  const initialModel = params.get("model") ?? undefined;

  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [activeLabel, setActiveLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const setMode = (m: Mode) => router.push(`/studio?mode=${m}`);

  const pushResult = (r: ResultItem) => setResults((prev) => [r, ...prev]);

  const pollVideo = useCallback(
    async (id: string, prompt: string, model: string) => {
      const tick = async () => {
        const res = await fetch(`/api/videos/${encodeURIComponent(id)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "查詢影片狀態失敗");
        if (json.status === "completed" && json.url) {
          pushResult({
            id: `${id}`,
            kind: "video",
            url: json.url,
            prompt,
            model,
            createdAt: Date.now(),
          });
          setBusy(false);
          setPanelOpen(true);
          return;
        }
        if (json.status === "failed") throw new Error("影片生成失敗");
        setStage(2);
        pollRef.current = setTimeout(tick, 4000);
      };
      await tick();
    },
    []
  );

  const handleSubmit = async ({
    prompt,
    model,
    settings,
    imagePayload,
  }: {
    prompt: string;
    model: string;
    settings: GenSettings;
    imagePayload?: Record<string, unknown>;
  }) => {
    setError(null);
    setBusy(true);
    setStage(0);
    setStartedAt(Date.now());
    setActiveLabel(prompt);

    try {
      setStage(1);

      if (mode === "video") {
        const res = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            seconds: settings.seconds,
            resolution: settings.resolution,
            ...(settings.aspectRatio !== "auto" ? { aspect_ratio: settings.aspectRatio } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "影片生成請求失敗");

        if (json.status === "completed" && json.url) {
          pushResult({ id: json.id ?? String(Date.now()), kind: "video", url: json.url, prompt, model, createdAt: Date.now() });
          setBusy(false);
          setPanelOpen(true);
        } else if (json.id) {
          await pollVideo(json.id, prompt, model);
        } else {
          throw new Error("API 沒有回傳影片 id 或網址");
        }
        return;
      }

      if (mode === "image") {
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
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "圖片生成請求失敗");
        setStage(3);
        (json.images ?? []).forEach((img: { url: string | null }, i: number) => {
          if (img.url) {
            pushResult({ id: `${Date.now()}-${i}`, kind: "image", url: img.url, prompt, model, createdAt: Date.now() });
          }
        });
        setBusy(false);
        setPanelOpen(true);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "文字生成請求失敗");
      setStage(3);
      const text = json?.choices?.[0]?.message?.content ?? "";
      pushResult({ id: String(Date.now()), kind: "text", text, prompt, model, createdAt: Date.now() });
      setBusy(false);
      setPanelOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "發生未預期的錯誤");
      setBusy(false);
    }
  };

  const latest = results[0];

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
          {busy ? (
            <GenerationProgress label={activeLabel} startedAt={startedAt} stageIndex={stage} />
          ) : error ? (
            <div className="max-w-lg rounded-xl border border-[#4a2020] bg-[#1a1010] px-5 py-4 text-[13.5px] leading-relaxed text-[#ffb4b4]">
              {error}
            </div>
          ) : latest ? (
            <div className="w-full max-w-3xl py-8">
              {latest.kind === "image" && latest.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={latest.url} alt={latest.prompt} className="mx-auto max-h-[60vh] rounded-xl" />
              )}
              {latest.kind === "video" && latest.url && (
                <video src={latest.url} controls className="mx-auto max-h-[60vh] rounded-xl" />
              )}
              {latest.kind === "text" && (
                <div className="whitespace-pre-wrap rounded-xl bg-[#141414] p-6 text-[14px] leading-relaxed">
                  {latest.text}
                </div>
              )}
              <p className="mt-4 text-center text-[12.5px] text-[#6d6d6d]">
                {latest.model} · {latest.prompt}
              </p>
            </div>
          ) : (
            <h2 className="text-[34px] font-normal text-[#5c5c5c]">用 The Blue Wing 點亮你的創作</h2>
          )}
        </div>

        <div className="px-8 pb-8">
          <div className="mx-auto w-full max-w-[840px]">
            <Composer
              mode={mode}
              onModeChange={setMode}
              onSubmit={handleSubmit}
              busy={busy}
              initialModel={initialModel}
            />
          </div>
        </div>
      </div>

      {panelOpen && <InspirationPanel history={results} onClose={() => setPanelOpen(false)} />}
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
