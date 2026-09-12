"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconImage, IconVideo } from "@/components/Icons";
import Director3DStudioBody from "@/components/canvas/director3d/Director3DStudioBody";
import { useDirector3DEditor, type RecordedClip, type RecordedFrame } from "@/components/canvas/director3d/useDirector3DEditor";
import { DIRECTOR3D_HANDOFF_KEY, defaultDirector3DData, type Director3DSceneData } from "@/lib/canvas/director3d";
import { uploadDataUrlAsset } from "@/lib/uploadAsset";
import { upload } from "@vercel/blob/client";
import { MAX_VIDEO_REF_BYTES, MAX_VIDEO_REF_BYTES_DIRECT } from "@/lib/videoRefs";

async function uploadImage(dataUrl: string, filename: string): Promise<{ id: number; src: string; name: string }> {
  return uploadDataUrlAsset(dataUrl, filename);
}

/**
 * Uploads a recorded 運鏡 clip to the token-gated public route SIRAYA's
 * servers fetch directly — see app/api/video-refs/[file]. Goes browser →
 * Blob directly (token from /api/video-refs/upload) so a 30s clip at a
 * usable bitrate isn't squeezed through the ~4.5MB serverless request
 * limit; falls back to the legacy ≤4MB multipart POST only where direct
 * upload isn't available.
 */
async function uploadVideoRef(clip: RecordedClip): Promise<{ url: string }> {
  const ext = clip.blob.type.includes("mp4") ? "mp4" : "webm";
  const type = ext === "mp4" ? "video/mp4" : "video/webm";
  const probe = await fetch("/api/video-refs/upload", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (probe?.available) {
    if (clip.blob.size > MAX_VIDEO_REF_BYTES_DIRECT) throw new Error(`影片檔太大，單檔上限 ${Math.floor(MAX_VIDEO_REF_BYTES_DIRECT / 1024 / 1024)} MB — 錄短一點再試`);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    const filename = `${token}.${ext}`;
    try {
      await upload(`video-refs/${filename}`, clip.blob, { access: "private", handleUploadUrl: "/api/video-refs/upload", contentType: type, multipart: clip.blob.size > 8 * 1024 * 1024 });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message.replace(/^Vercel Blob:\s*/, "") : "運鏡影片上傳失敗");
    }
    return { url: `${window.location.origin}/api/video-refs/${filename}` };
  }
  if (clip.blob.size > MAX_VIDEO_REF_BYTES) throw new Error(`這個環境的運鏡影片上限是 ${Math.floor(MAX_VIDEO_REF_BYTES / 1024 / 1024)} MB — 錄短一點再試`);
  const form = new FormData();
  form.append("file", clip.blob, `director3d-camera-move.${ext}`);
  const res = await fetch("/api/video-refs", { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || "運鏡影片上傳失敗");
  return j;
}

/**
 * Standalone entry point for 3D導演台 — same editor as the Canvas-node
 * modal (Director3DStudioBody), just reachable directly from the sidebar
 * instead of only from inside a 智慧畫布 workflow. Loads/saves the user's
 * scene from this component so useDirector3DEditor's own autosave effect
 * (remotePersist=true) has real initial data to diff against — see
 * app/api/director3d/route.ts for the per-account storage this replaced
 * localStorage with.
 */
export default function Director3DStandalonePage() {
  const router = useRouter();
  const [initial, setInitial] = useState<Director3DSceneData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/director3d")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login?next=/canvas/director3d");
          return null;
        }
        return r.ok ? r.json() : Promise.reject(new Error());
      })
      .then((j: { scene: Director3DSceneData | null } | null) => {
        if (!alive || !j) return;
        const scene = j.scene && Array.isArray(j.scene.characters) ? j.scene : defaultDirector3DData();
        setInitial(scene);
      })
      .catch(() => alive && setLoadError("載入場景失敗，稍後再試"));
    return () => {
      alive = false;
    };
  }, [router]);

  if (loadError) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-sm rounded-xl border border-[#4a2020] bg-[#1a1010] px-5 py-4 text-center text-[13.5px] text-[#ffb4b4]">{loadError}</div>
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="grid h-full place-items-center">
        <div className="bw-shimmer h-8 w-8 rounded-full" />
      </div>
    );
  }

  return <Director3DStandaloneEditor initial={initial} />;
}

function Director3DStandaloneEditor({ initial }: { initial: Director3DSceneData }) {
  const router = useRouter();
  const editor = useDirector3DEditor(initial, true);
  const [sending, setSending] = useState<"image" | "video" | "frames" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handoff = (
    refs: { id: number; src: string; name: string }[],
    mode: "image" | "video",
    promptHint?: string,
    videoRef?: { url: string }
  ) => {
    sessionStorage.setItem(DIRECTOR3D_HANDOFF_KEY, JSON.stringify({ refs, promptHint, videoRef }));
    router.push(`/studio?mode=${mode}`);
  };

  const sendTo = async (mode: "image" | "video") => {
    setErr(null);
    setSending(mode);
    try {
      const dataUrl = editor.captured ?? editor.takeScreenshot();
      if (!dataUrl) throw new Error("請先截圖");
      const asset = await uploadImage(dataUrl, "director3d.jpg");
      handoff([asset], mode);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "傳送失敗，請稍後再試");
    } finally {
      setSending(null);
    }
  };

  const exportFramesForVideo = async (frames: RecordedFrame[], promptHint: string, clip: RecordedClip | null) => {
    setErr(null);
    setSending("frames");
    try {
      if (!frames.length && !clip) throw new Error("還沒有錄到任何畫面");
      const [assets, videoRef] = await Promise.all([
        Promise.all(frames.map((f, i) => uploadImage(f.url, `director3d-frame-${i}.jpg`))),
        clip ? uploadVideoRef(clip) : Promise.resolve(undefined),
      ]);
      handoff(assets, "video", promptHint, videoRef);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "傳送失敗，請稍後再試");
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[#1c1c1c] bg-black px-4">
        <Link href="/canvas" className="rounded-lg p-1.5 text-[#9a9a9a] transition-colors hover:text-white" aria-label="返回智慧畫布">
          <IconChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-[13px] font-medium text-white">3D 導演台</span>
        <span className="hidden text-[11px] text-[#6d6d6d] sm:inline">拖曳空白處旋轉視角、滾輪縮放；拖曳角色可移動；「路徑」分頁點擊放置路線、「鏡頭」分頁設定運鏡；場景會存到你的帳號</span>
        <div className="ml-auto flex items-center gap-2">
          {err && <span className="text-[11.5px] text-[#ff9b9b]">{err}</span>}
          <button type="button" onClick={editor.takeScreenshot} className="h-8 rounded-full bg-[#1f1f1f] px-3.5 text-[12.5px] text-white hover:bg-[#282828]">
            📷 截圖
          </button>
          <button
            type="button"
            onClick={() => sendTo("image")}
            disabled={sending !== null}
            className="flex h-8 items-center gap-1.5 rounded-full bg-[#1f1f1f] px-3.5 text-[12.5px] text-white hover:bg-[#282828] disabled:opacity-50"
          >
            <IconImage className="h-3.5 w-3.5" />
            {sending === "image" ? "傳送中…" : "用於圖片生成"}
          </button>
          <button
            type="button"
            onClick={() => sendTo("video")}
            disabled={sending !== null}
            className="flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3.5 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50"
          >
            <IconVideo className="h-3.5 w-3.5" />
            {sending === "video" ? "傳送中…" : "用於影片生成"}
          </button>
        </div>
      </div>

      <Director3DStudioBody editor={editor} onExportFramesForVideo={exportFramesForVideo} exportingFrames={sending === "frames"} />
    </div>
  );
}
