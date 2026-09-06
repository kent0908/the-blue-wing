"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconImage, IconVideo } from "@/components/Icons";
import Director3DStudioBody from "@/components/canvas/director3d/Director3DStudioBody";
import { useDirector3DEditor, type RecordedFrame } from "@/components/canvas/director3d/useDirector3DEditor";
import { DIRECTOR3D_HANDOFF_KEY, DIRECTOR3D_SCENE_KEY, defaultDirector3DData, type Director3DSceneData } from "@/lib/canvas/director3d";

function loadSavedScene(): Director3DSceneData {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(DIRECTOR3D_SCENE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Director3DSceneData;
      if (Array.isArray(parsed.characters)) return parsed;
    }
  } catch {
    // fall through to a fresh scene — a corrupt/old save shouldn't block opening the page
  }
  return defaultDirector3DData();
}

async function uploadImage(dataUrl: string, filename: string): Promise<{ id: number; src: string; name: string }> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await fetch("/api/assets", { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || "上傳失敗");
  return j.asset;
}

/**
 * Standalone entry point for 3D導演台 — same editor as the Canvas-node
 * modal (Director3DStudioBody), just reachable directly from the sidebar
 * instead of only from inside a 智慧畫布 workflow. Your scene autosaves to
 * this browser (see useDirector3DEditor's persistKey). A screenshot, or a
 * recorded 運鏡's sampled frames, hand off straight into 圖片生成/影片生成 as
 * reference images: upload to the asset library, then push the same
 * {id,src,name} shape a template preset's reference image uses (see
 * app/studio/page.tsx) via DIRECTOR3D_HANDOFF_KEY.
 */
export default function Director3DStandalonePage() {
  const router = useRouter();
  const [initial] = useState(loadSavedScene);
  const editor = useDirector3DEditor(initial, DIRECTOR3D_SCENE_KEY);
  const [sending, setSending] = useState<"image" | "video" | "frames" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handoff = (refs: { id: number; src: string; name: string }[], mode: "image" | "video", promptHint?: string) => {
    sessionStorage.setItem(DIRECTOR3D_HANDOFF_KEY, JSON.stringify({ refs, promptHint }));
    router.push(`/studio?mode=${mode}`);
  };

  const sendTo = async (mode: "image" | "video") => {
    setErr(null);
    setSending(mode);
    try {
      const dataUrl = editor.captured ?? editor.takeScreenshot();
      if (!dataUrl) throw new Error("請先截圖");
      const asset = await uploadImage(dataUrl, "director3d.png");
      handoff([asset], mode);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "傳送失敗，請稍後再試");
    } finally {
      setSending(null);
    }
  };

  const exportFramesForVideo = async (frames: RecordedFrame[], promptHint: string) => {
    setErr(null);
    setSending("frames");
    try {
      if (!frames.length) throw new Error("還沒有錄到任何畫面");
      const assets = await Promise.all(frames.map((f, i) => uploadImage(f.url, `director3d-frame-${i}.jpg`)));
      handoff(assets, "video", promptHint);
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
        <span className="hidden text-[11px] text-[#6d6d6d] sm:inline">拖曳畫面旋轉視角、滾輪縮放；點角色可選取；場景會自動存在這台瀏覽器</span>
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
