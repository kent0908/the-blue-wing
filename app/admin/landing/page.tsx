"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import AdminTabs from "../AdminTabs";

import { LANDING_SLOTS } from "@/lib/landingSlots";

interface MediaInfo {
  kind: "image" | "video";
  url: string;
  updatedAt: string;
}

export default function AdminLandingPage() {
  const router = useRouter();
  const [media, setMedia] = useState<Record<string, MediaInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/landing-media");
      if (res.status === 401) return router.push("/login?next=/admin/landing");
      const json = await res.json();
      if (res.status === 403) {
        setError("需要管理員權限");
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message || "載入失敗");
      setMedia(json.media ?? {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is this view's data fetch
    load();
  }, [load]);

  const handleUpload = async (slot: string, file: File) => {
    if (file.size > 30 * 1024 * 1024) { setError("檔案不可超過 30 MB"); return; }
    setBusySlot(slot);
    setProgress(0);
    setError(null);
    try {
      const previousVersion = media[slot]?.updatedAt;
      await upload(file.name, file, {
        access: "private",
        handleUploadUrl: "/api/admin/landing-media/upload",
        clientPayload: JSON.stringify({ slot }),
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      let published = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const response = await fetch("/api/landing-media", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error("無法確認發布狀態，請重新整理查看");
        if (result.media?.[slot] && result.media[slot].updatedAt !== previousVersion) { setMedia(result.media); published = true; break; }
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      if (!published) setError("檔案已上傳，發布仍在處理中；請稍後重新整理確認。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "上傳失敗");
    } finally {
      setBusySlot(null);
      setProgress(null);
    }
  };

  const handleRemove = async (slot: string) => {
    if (!confirm("移除這個區塊的媒體，改回預設視覺？")) return;
    setBusySlot(slot);
    try {
      const res = await fetch(`/api/admin/landing-media?slot=${encodeURIComponent(slot)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message || "移除失敗");
        return;
      }
      await load();
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <div className="min-w-0">
      <div className="w-full py-2">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">啟程展示媒體</h1>
          <Link href="/account" className="text-[12.5px] text-[#8a8a8a] hover:text-white">回帳號</Link>
        </div>
        <AdminTabs active="landing" />

        <p className="text-[13px] leading-relaxed text-[#8a8a8a]">
          每個創作區有一個主展示與兩個延伸展示，可分別上傳圖片或影片（最大 30 MB）。原有主展示會保留；延伸位置上傳後約一分鐘內出現在啟程頁。
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-[#4a2020] bg-[#1a1010] px-4 py-3 text-[13px] text-[#ffb4b4]">{error}</div>
        )}
        {loading && <p className="mt-4 text-[12px] text-[#6d6d6d]">載入中…</p>}

        <div className="mt-5 space-y-4">
          {LANDING_SLOTS.map((slot) => {
            const current = media[slot.key];
            const isBusy = busySlot === slot.key;
            return (
              <div key={slot.key} className="flex flex-wrap items-center gap-4 rounded-xl border border-[#262626] bg-[#141414] p-4">
                <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#0a0a0a]">
                  {current?.kind === "video" ? (
                    <video src={current.url} className="h-full w-full object-cover" muted loop autoPlay playsInline disablePictureInPicture disableRemotePlayback />
                  ) : current?.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.url} alt={slot.label} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10.5px] text-[#5c5c5c]">尚未設定</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-white">{slot.label}</div>
                  <div className="text-[11px] text-[#6d6d6d]">{slot.hint}</div>
                  {isBusy && progress !== null && (
                    <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-[#242424]">
                      <div className="h-full bg-[#7ff0cd] transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    ref={(el) => {
                      fileInputs.current[slot.key] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(slot.key, file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputs.current[slot.key]?.click()}
                    disabled={busySlot !== null}
                    className="rounded-lg bg-[#242424] px-3 py-1.5 text-[12px] hover:bg-[#2e2e2e] disabled:opacity-40"
                  >
                    {isBusy ? "上傳中…" : current ? "更換" : "上傳"}
                  </button>
                  {current && (
                    <button
                      type="button"
                      onClick={() => handleRemove(slot.key)}
                      disabled={busySlot !== null}
                      className="rounded-lg bg-[#242424] px-3 py-1.5 text-[12px] text-[#ff9b9b] hover:bg-[#2e2e2e] disabled:opacity-40"
                    >
                      移除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

