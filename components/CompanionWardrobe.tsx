"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconLock, IconChevronLeft, IconChevronRight } from "./Icons";

interface OutfitIdleVideo {
  id: number;
  status: "pending" | "completed" | "failed";
  url: string | null;
}

interface OutfitChange {
  id: number;
  outfitKey: string;
  creditsSpent: number;
  retryUsed: boolean;
  createdAt: string;
  videos: OutfitIdleVideo[];
}

interface OutfitCatalogItem {
  key: string;
  label: string;
  /** Admin-managed preview image — always null for now (no upload UI exists
   *  yet for this), wired through so the card below already renders one the
   *  moment that changes. */
  imageUrl: string | null;
}

interface WardrobeData {
  eligible: boolean;
  cost: number;
  catalog: OutfitCatalogItem[];
  changes: OutfitChange[];
}

/**
 * 換裝衣櫃 — locked until affection reaches 熱戀時刻 (80). Picking an outfit
 * spends credits (lib/characterOutfits.ts) and generates a new idle-loop
 * video wearing it, which becomes the character's active loop once done
 * (shown in the sibling CompanionIdleStage panel, not rendered again here).
 */
export default function CompanionWardrobe({ characterId }: { characterId: number }) {
  const [data, setData] = useState<WardrobeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyRetryId, setBusyRetryId] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const loadRef = useRef<() => void>(() => {});

  const load = useCallback(() => {
    return fetch(`/api/characters/${characterId}/outfits`)
      .then((res) => res.json().catch(() => ({})).then((j) => ({ res, j })))
      .then(({ res, j }) => {
        if (!aliveRef.current) return;
        if (!res.ok) {
          setError(j?.error?.message || "載入失敗");
          return;
        }
        setData(j);
        setError(null);
        const stillPending = (j.changes as OutfitChange[] | undefined)?.some((c) =>
          c.videos.some((v) => v.status === "pending")
        );
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

  const buy = async (outfitKey: string, label: string) => {
    if (!data || busyKey) return;
    if (!confirm(`花費 ${data.cost} 點換上「${label}」，確定嗎？`)) return;
    setBusyKey(outfitKey);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/outfits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "換裝失敗");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "換裝失敗");
    } finally {
      setBusyKey(null);
    }
  };

  const retry = async (changeId: number) => {
    if (busyRetryId) return;
    setBusyRetryId(changeId);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/outfits/${changeId}/retry`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "重新生成失敗");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新生成失敗");
    } finally {
      setBusyRetryId(null);
    }
  };

  const labelFor = (key: string) => data?.catalog.find((o) => o.key === key)?.label ?? key;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="展開換裝衣櫃"
        className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-[#1c1c1c] bg-[#050505] pt-4 text-[#8a8a8a] transition-colors hover:text-white"
      >
        <IconChevronRight className="h-4 w-4" />
        <span className="text-[11px] tracking-widest" style={{ writingMode: "vertical-rl" }}>
          換裝衣櫃
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-[#1c1c1c] bg-[#050505] p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-white">換裝衣櫃</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="收合換裝衣櫃"
          className="rounded-lg p-1 text-[#8a8a8a] transition-colors hover:text-white"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {!data && !error && <div className="mx-auto mt-8 h-6 w-6 animate-pulse rounded-full bg-[#1c1c1c]" />}

      {data && !data.eligible && (
        <div className="rounded-xl border border-[#3a2e18] bg-[#1a150c] p-4 text-center">
          <IconLock className="mx-auto h-5 w-5 text-[#f0c27f]" />
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#f0c27f]">
            好感度到「熱戀時刻」（80）以上才能解鎖換裝衣櫃，多聊聊累積好感度吧
          </p>
        </div>
      )}

      {data && data.eligible && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {data.catalog.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => buy(o.key, o.label)}
                disabled={!!busyKey}
                className="group relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#141414] px-2 py-3 text-center transition-colors hover:border-[#555] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {o.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-managed preview, arbitrary source
                  <img
                    src={o.imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-50 transition-opacity group-hover:opacity-70"
                  />
                )}
                <span className="relative text-[12.5px] font-medium text-white">{o.label}</span>
                <span className="relative text-[10.5px] text-[#7ff0cd]">{busyKey === o.key ? "生成中…" : `${data.cost} 點`}</span>
              </button>
            ))}
          </div>

          {error && <p className="mt-3 text-[11px] leading-relaxed text-[#ff9b9b]">{error}</p>}

          {data.changes.length > 0 && (
            <div className="mt-5 border-t border-[#1c1c1c] pt-3">
              <p className="mb-2 text-[12px] font-medium text-[#a8a8a8]">換裝紀錄</p>
              <div className="space-y-2">
                {data.changes.map((c) => {
                  const latest = c.videos[c.videos.length - 1];
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-lg bg-[#111] px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] text-white">{labelFor(c.outfitKey)}</div>
                        <div className="text-[10.5px] text-[#6d6d6d]">
                          {latest?.status === "pending" ? "生成中…" : latest?.status === "failed" ? "生成失敗" : "已完成"}
                        </div>
                      </div>
                      {!c.retryUsed && latest && latest.status !== "pending" && (
                        <button
                          type="button"
                          onClick={() => retry(c.id)}
                          disabled={busyRetryId === c.id}
                          className="shrink-0 rounded-full border border-[#3a3a3a] px-2.5 py-1 text-[10.5px] text-[#c9c9c9] transition-colors hover:border-[#555] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyRetryId === c.id ? "生成中…" : "免費重生成一次"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
