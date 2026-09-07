"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface IdleVideo {
  id: number;
  status: "pending" | "completed" | "failed";
  url: string | null;
  free: boolean;
  creditsSpent: number;
  isActive: boolean;
  createdAt: string;
}

interface IdleData {
  videos: IdleVideo[];
  freeAvailable: boolean;
  paidCost: number;
  hasAvatar: boolean;
}

/**
 * The looping "待機影片" panel on a character chat page — auto-generated
 * (free, once a month per account) when the character is created, with a
 * manual regenerate button below that costs credits once that free slot is
 * spent (cost shown up front, never charged without the user clicking
 * through a confirm). See lib/characterIdleVideo.ts for the generation/quota
 * logic this only displays and triggers.
 */
export default function CompanionIdleStage({
  characterId,
  avatarSrc,
}: {
  characterId: number;
  avatarSrc: string | null;
}) {
  const [data, setData] = useState<IdleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  // A pending job re-schedules itself via this ref (not the `load` closure
  // directly) so the recursive call always sees the latest declaration
  // instead of referencing `load` before its own initializer runs.
  const loadRef = useRef<() => void>(() => {});

  // Plain .then() chain rather than async/await — matches
  // components/CharacterScenes.tsx's own load(), and (unlike an async
  // function called directly from an effect body) doesn't trip the
  // react-hooks/set-state-in-effect rule.
  const load = useCallback(() => {
    return fetch(`/api/characters/${characterId}/idle-video`)
      .then((res) => res.json().catch(() => ({})).then((j) => ({ res, j })))
      .then(({ res, j }) => {
        if (!aliveRef.current) return;
        if (!res.ok) {
          setError(j?.error?.message || "載入失敗");
          return;
        }
        setData(j);
        setError(null);
        const stillPending = (j.videos as IdleVideo[] | undefined)?.some((v) => v.status === "pending");
        if (stillPending) pollTimer.current = setTimeout(() => loadRef.current(), 4000);
      })
      .catch(() => {
        if (aliveRef.current) setError("載入失敗");
      });
  }, [characterId]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [load]);

  const regenerate = async (confirmPaid: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/idle-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPaid }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 402 && j?.needsConfirm) {
        setBusy(false);
        if (confirm(`這個月的免費額度已經用掉了，重新生成需要 ${j.cost} 點，確定要繼續嗎？`)) {
          await regenerate(true);
        }
        return;
      }
      if (!res.ok) throw new Error(j?.error?.message || "生成失敗");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失敗");
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (videoId: number) => {
    try {
      const res = await fetch(`/api/characters/${characterId}/idle-video/${videoId}`, { method: "PATCH" });
      if (res.ok) await load();
    } catch {
      /* best-effort */
    }
  };

  const videos = data?.videos ?? [];
  const active = videos.find((v) => v.isActive && v.status === "completed" && v.url);
  const pending = videos.some((v) => v.status === "pending");
  const completedList = videos.filter((v) => v.status === "completed" && v.url);

  const buttonLabel = pending
    ? "生成中…"
    : videos.length === 0
      ? data?.freeAvailable
        ? "免費生成待機影片"
        : `生成待機影片（${data?.paidCost ?? "…"} 點）`
      : data?.freeAvailable
        ? "重新生成（免費）"
        : `重新生成（${data?.paidCost ?? "…"} 點）`;

  return (
    <div className="flex w-[360px] shrink-0 flex-col border-r border-[#1c1c1c] bg-[#050505]">
      <div className="relative flex-1 overflow-hidden p-3">
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#141414] to-[#0a0a0a]">
          {active ? (
            <video
              key={active.id}
              src={active.url!}
              className="h-full w-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              disablePictureInPicture
              disableRemotePlayback
            />
          ) : avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream
            <img src={avatarSrc} alt="" className="h-full w-full object-cover opacity-80" />
          ) : (
            <div className="grid h-full w-full place-items-center px-6 text-center text-[12.5px] leading-relaxed text-[#5c5c5c]">
              還沒有待機影片，點下方按鈕生成一支
            </div>
          )}
          {pending && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 text-center">
              <p className="px-4 text-[13px] leading-relaxed text-[#e5e5e5]">夥伴正在啟程，請稍後…</p>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#1c1c1c] p-3">
        {completedList.length > 1 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {completedList.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setActive(v.id)}
                className={[
                  "h-12 w-12 shrink-0 overflow-hidden rounded-lg border transition-opacity",
                  v.isActive ? "border-[#7ff0cd]" : "border-[#2a2a2a] opacity-70 hover:opacity-100",
                ].join(" ")}
                aria-label="設為待機影片"
                title={v.isActive ? "目前使用中" : "設為待機影片"}
              >
                <video
                  src={v.url!}
                  className="h-full w-full object-cover"
                  muted
                  preload="metadata"
                  disablePictureInPicture
                  disableRemotePlayback
                />
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => regenerate(false)}
          disabled={busy || pending}
          className="h-8 w-full rounded-full border border-[#3a3a3a] text-[12px] text-[#c9c9c9] transition-colors hover:border-[#555] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>
        {error && <p className="mt-1.5 text-[11px] leading-relaxed text-[#ff9b9b]">{error}</p>}
      </div>
    </div>
  );
}
