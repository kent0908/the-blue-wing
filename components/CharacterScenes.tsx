"use client";

import { modelLabel } from "@/lib/modelLabel";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconClose, IconDownload, IconLock } from "./Icons";

interface Scene {
  id: number;
  kind: "image" | "video";
  levelIndex: number;
  url: string;
  createdAt: string;
}

interface SceneQuote { id: string; kind: "image" | "video"; model: string; credits: number; seconds: number | null; resolution: string | null; summary: string; expiresAt: string; }

interface ScenesData {
  scenes: Scene[];
  unlocked: boolean;
  eligible: boolean;
  avatarAssetId: number | null;
  pending?: { requestId: string; kind: "image" | "video"; status: string }[];
  avatarReady?: boolean;
  reason?: string;
  suggested: {
    image: { prompt: string; model: string };
    video: { prompt: string; model: string };
  };
}

/**
 * 解鎖場景 — 高階方案專屬。生成本身重用既有的 /api/images、/api/videos
 * （額度、逾時處理、re-host 都一樣），這個面板只負責：判斷是否解鎖、組
 * 建議的 prompt/model、觸發生成、把結果記錄成這個角色的場景。
 */
export default function CharacterScenes({ characterId, onClose, refreshKey }: { characterId: number; onClose: () => void; refreshKey?: number }) {
  const [data, setData] = useState<ScenesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [busyLabel, setBusyLabel] = useState("");
  const [quote, setQuote] = useState<SceneQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

  const preview = async (kind: "image" | "video") => {
    if (busy || quoting) return;
    setQuoting(true); setError(null); setQuote(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/scenes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({kind, action:"quote"}) });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error?.message || "無法取得點數預覽");
      setQuote(result.quote);
    } catch (e) { setError(e instanceof Error ? e.message : "無法取得點數預覽"); } finally { setQuoting(false); }
  };

  const load = useCallback(() =>
    fetch(`/api/characters/${characterId}/scenes`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || "載入失敗"); return j; })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗")), [characterId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (busy || !data?.pending?.length) return;
    let alive = true;
    const timer = setTimeout(() => {
      Promise.all(data.pending!.map(async (pending) => {
        const res = await fetch(`/api/characters/${characterId}/scenes?requestId=${encodeURIComponent(pending.requestId)}`);
        const result = await res.json();
        if (!res.ok || result.status === "failed") throw new Error(result?.error?.message || "場景生成失敗");
      })).then(() => { if (alive) void load(); }).catch(e => { if (alive) setError(e instanceof Error ? e.message : "查詢場景失敗"); });
    }, 4000);
    return () => { alive = false; clearTimeout(timer); };
  }, [data?.pending, busy, characterId, load]);

  const generate = async (kind: "image" | "video") => {
    if (!data || busy || !quote || quote.kind !== kind || !data.unlocked || !data.eligible) return;
    setError(null); setBusy(kind);
    setBusyLabel(kind === "image" ? "生成圖片場景中…" : "生成影片場景中…");
    try {
      const response = await fetch(`/api/characters/${characterId}/scenes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, action: "generate", quoteId: quote.id }) });
      let result = await response.json();
      if (!response.ok) { if (response.status === 409) setQuote(null); throw new Error(result?.error?.message || "生成失敗"); }
      setQuote(null);
      for (let i = 0; result.status === "processing" && i < 200; i++) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const poll = await fetch(`/api/characters/${characterId}/scenes?requestId=${encodeURIComponent(result.requestId)}`);
        const next = await poll.json();
        if (!poll.ok || next.status === "failed") throw new Error(next?.error?.message || "生成失敗");
        result = { ...next, requestId: result.requestId };
      }
      if (result.status !== "completed") throw new Error("生成仍在處理，請稍後重新查看場景");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "生成失敗"); }
    finally { setBusy(null); }
  };

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-col border-l border-[#1c1c1c] bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[14px] font-medium">解鎖場景</span>
        <button type="button" onClick={onClose} aria-label="關閉" className="text-[#8a8a8a] hover:text-white">
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {error && <p role="alert" className="my-3 text-xs text-[#ff9b9b]">{error}</p>}
        {!!data?.pending?.length && <p className="my-3 text-xs text-[#7ff0cd]">場景生成中，正在更新進度…</p>}
        {data?.reason && <p className="my-3 text-xs text-[#a0aaa6]">{data.reason}</p>}
        {!data && !error && <div className="mx-auto mt-10 h-6 w-6 animate-pulse rounded-full bg-[#1c1c1c]" />}

        {data && !data.unlocked && (
          <div className="rounded-xl border border-[#3a2e18] bg-[#1a150c] p-4 text-center">
            <IconLock className="mx-auto h-5 w-5 text-[#f0c27f]" />
            <p className="mt-2 text-[13px] leading-relaxed text-[#f0c27f]">
              角色專屬圖片／影片場景是高階方案的功能，升級後就能為每個關係階段生成獨一無二的畫面。
            </p>
            <Link
              href="/account"
              className="mt-3 inline-block rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 py-1.5 text-[12.5px] font-medium text-[#0a1a16]"
            >
              查看方案
            </Link>
          </div>
        )}

        {data && data.unlocked && !data.eligible && (
          <p className="mt-8 text-center text-[13px] leading-relaxed text-[#6d6d6d]">
            這個角色還沒解鎖任何關係階段
            <br />
            多聊聊，好感度到一定程度就能生成專屬場景
          </p>
        )}

        {data && data.unlocked && data.eligible && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => preview("image")}
                disabled={quoting || !!busy || !!data.pending?.length || data.avatarReady === false}
                className="h-9 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[12.5px] font-medium text-[#0a1a16] disabled:cursor-not-allowed disabled:opacity-60"
              >
                圖片場景預覽
              </button>
              <button
                type="button"
                onClick={() => preview("video")}
                disabled={!!busy}
                className="h-9 rounded-full border border-[#3a3a3a] text-[12.5px] text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                影片場景預覽
              </button>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-[#8daba1]">依目前好感度、角色素材與近期對話準備場景。先查看點數，再確認生成。</p>
            {quoting && <p className="mt-3 text-xs text-[#7ff0cd]">正在取得場景與點數預覽…</p>}
            {quote && <section aria-label="場景生成確認" className="mt-4 space-y-3 rounded-xl border border-[#7ff0cd55] bg-[#10201a] p-3 text-xs">
              <h3 className="text-sm font-medium text-[#b7f5e1]">確認場景與點數</h3>
              <p className="break-words text-[#b5c7c0]">{modelLabel(quote.model)}{quote.resolution ? ` · ${quote.resolution}` : ""}{quote.seconds ? ` · ${quote.seconds} 秒` : ""}</p>
              <p className="whitespace-pre-wrap break-words leading-relaxed text-[#b5c7c0]">{quote.summary}</p>
              <p className="text-base font-medium text-white">本次消耗 {quote.credits} 點</p>
              <p className="text-[11px] text-[#91a99f]">確認後才扣點。生成失敗會依實際扣款紀錄退回。</p>
              <div className="flex flex-wrap gap-2"><button type="button" disabled={!!busy} onClick={() => generate(quote.kind)} className="flex-1 rounded-full bg-[#7ff0cd] px-3 py-2 font-medium text-[#0b1712] disabled:opacity-50">確認扣 {quote.credits} 點並生成</button><button type="button" disabled={!!busy} onClick={() => setQuote(null)} className="rounded-full border border-white/20 px-3 py-2">取消</button></div>
            </section>}
            {busy && <p className="mt-3 text-center text-[12px] text-[#7d7d7d]">{busyLabel}</p>}
            {error && <p className="mt-3 text-center text-[12px] text-[#ff9b9b]">{error}</p>}

            {data.scenes.length === 0 ? (
              <p className="mt-8 text-center text-[13px] text-[#6d6d6d]">還沒有任何場景，點上面按鈕生成第一個</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {data.scenes.map((s) => (
                  <div key={s.id} className="group relative overflow-hidden rounded-xl border border-[#262626] bg-[#111]">
                    {s.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- upstream/blob url
                      <img src={s.url} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <video disablePictureInPicture disableRemotePlayback src={s.url} className="aspect-square w-full object-cover" muted preload="metadata" />
                    )}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/80 group-hover:opacity-100"
                    >
                      <IconDownload className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
