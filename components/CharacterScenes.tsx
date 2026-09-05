"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconClose, IconDownload, IconLock } from "./Icons";

interface Scene {
  id: number;
  kind: "image" | "video";
  levelIndex: number;
  url: string;
  createdAt: string;
}

interface ScenesData {
  scenes: Scene[];
  unlocked: boolean;
  eligible: boolean;
  avatarAssetId: number | null;
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
export default function CharacterScenes({ characterId, onClose }: { characterId: number; onClose: () => void }) {
  const [data, setData] = useState<ScenesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [busyLabel, setBusyLabel] = useState("");

  const load = () =>
    fetch(`/api/characters/${characterId}/scenes`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("載入失敗"));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  // Bounded the same way as lib/jobsStore.tsx's own video poll — a job that
  // never resolves would otherwise leave `busy` stuck forever with no way for
  // the user to recover short of reloading the page.
  const pollVideo = async (id: string, model: string, prompt: string): Promise<string> => {
    for (let i = 0; i < 200; i++) {
      await new Promise((res) => setTimeout(res, 4000));
      const qs = new URLSearchParams({ model, prompt });
      const res = await fetch(`/api/videos/${encodeURIComponent(id)}?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "查詢影片狀態失敗");
      if (j.status === "completed" && j.url) return j.url;
      if (j.status === "failed") throw new Error("影片生成失敗");
    }
    throw new Error("影片生成逾時，請稍後再試");
  };

  const generate = async (kind: "image" | "video") => {
    if (!data || busy) return;
    setError(null);
    setBusy(kind);
    setBusyLabel(kind === "image" ? "生成圖片場景中…" : "生成影片場景中…（影片較久，請耐心等候）");
    try {
      const { prompt, model } = data.suggested[kind];
      // Anchor the scene to the character's own look — without this it's just
      // a generic prompt render with no visual continuity to who they are.
      const assetIds = data.avatarAssetId ? [data.avatarAssetId] : undefined;

      let url: string;
      if (kind === "image") {
        const res = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, n: 1, response_format: "url", assetIds }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error?.message || "圖片生成失敗");
        url = j?.images?.[0]?.url;
        if (!url) throw new Error("沒有取得圖片");
      } else {
        const res = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, seconds: 5, resolution: "720p", assetIds }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error?.message || "影片生成失敗");
        url = j.status === "completed" && j.url ? j.url : await pollVideo(j.id, model, prompt);
      }

      const rec = await fetch(`/api/characters/${characterId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, url, prompt, model }),
      });
      const recJson = await rec.json().catch(() => ({}));
      if (!rec.ok) throw new Error(recJson?.error?.message || "場景記錄失敗");

      setData((cur) => (cur ? { ...cur, scenes: [recJson.scene, ...cur.scenes] } : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失敗");
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[#1c1c1c] bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[14px] font-medium">解鎖場景</span>
        <button type="button" onClick={onClose} aria-label="關閉" className="text-[#8a8a8a] hover:text-white">
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
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
                onClick={() => generate("image")}
                disabled={!!busy}
                className="h-9 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[12.5px] font-medium text-[#0a1a16] disabled:cursor-not-allowed disabled:opacity-60"
              >
                生成圖片場景
              </button>
              <button
                type="button"
                onClick={() => generate("video")}
                disabled={!!busy}
                className="h-9 rounded-full border border-[#3a3a3a] text-[12.5px] text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                生成影片場景
              </button>
            </div>

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
                      <video src={s.url} className="aspect-square w-full object-cover" muted preload="metadata" />
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
