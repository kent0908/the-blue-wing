"use client";

import { useEffect, useState } from "react";
import { IconClose } from "../Icons";
import { exportDoc, type EditorDoc, type ExportFormat } from "@/lib/layerEditor";
import { uploadAsset } from "@/lib/uploadAsset";

/**
 * 匯出: renders the document through the same renderDoc every AI path uses
 * (lib/layerEditor.ts), at the chosen format / scale / transparency, and
 * either downloads it, saves it into 資產庫, or hands it to /studio as a
 * reference (first frame for video, or image-to-image).
 */
export default function ExportDialog({
  doc,
  skipIds,
  onClose,
  onHandoff,
}: {
  doc: EditorDoc;
  skipIds?: Set<string>;
  onClose: () => void;
  /** after the composite is in 資產庫: navigate to /studio with it attached */
  onHandoff: (asset: { id: number; src: string; name: string }, mode: "image" | "video") => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(doc.canvas.background === "transparent");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    exportDoc(doc, "jpeg", Math.min(1, 480 / Math.max(doc.canvas.width, doc.canvas.height)), false, skipIds)
      .then((b) => alive && setPreview(URL.createObjectURL(b)))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // preview is a one-off thumbnail of the doc as opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const render = () => exportDoc(doc, format, scale, transparent, skipIds);
  const filename = () => `layer-editor-${Date.now()}.${format === "jpeg" ? "jpg" : format}`;

  const download = async () => {
    setError(null);
    setBusy("download");
    try {
      const blob = await render();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "匯出失敗");
    } finally {
      setBusy(null);
    }
  };

  const toLibrary = async (then?: "image" | "video") => {
    setError(null);
    setBusy(then ?? "library");
    try {
      const blob = await render();
      const asset = await uploadAsset(new File([blob], filename(), { type: blob.type }));
      if (then) onHandoff(asset, then);
      else setError("已存到資產庫 ✓");
    } catch (e) {
      setError(e instanceof Error ? e.message : "存到資產庫失敗");
    } finally {
      setBusy(null);
    }
  };

  const outW = Math.round(doc.canvas.width * scale);
  const outH = Math.round(doc.canvas.height * scale);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4">
      <div className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#111]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1c] px-4">
          <span className="text-[13px] font-medium text-white">匯出 / 送出</span>
          <button type="button" onClick={onClose} aria-label="關閉" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-5 p-4">
          <div className="flex w-[240px] shrink-0 items-center justify-center rounded-lg bg-[#0a0a0a] p-2">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="預覽" className="max-h-[240px] max-w-full rounded object-contain" />
            ) : (
              <span className="text-[11px] text-[#6d6d6d]">產生預覽中…</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="mb-1 text-[10.5px] text-[#8a8a8a]">格式</div>
              <div className="flex gap-1.5">
                {(["png", "jpeg", "webp"] as ExportFormat[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFormat(f)} className={`rounded-md px-2.5 py-1 text-[11.5px] ${format === f ? "bg-[#233a34] text-[#7ff0cd]" : "bg-[#1f1f1f] text-[#c9c9c9]"}`}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10.5px] text-[#8a8a8a]">
                輸出倍率 <span className="text-[#c9c9c9]">{scale}× → {outW}×{outH}</span>
              </div>
              <div className="flex gap-1.5">
                {[0.5, 1, 2, 3].map((s) => (
                  <button key={s} type="button" onClick={() => setScale(s)} className={`rounded-md px-2.5 py-1 text-[11.5px] ${scale === s ? "bg-[#233a34] text-[#7ff0cd]" : "bg-[#1f1f1f] text-[#c9c9c9]"}`}>
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <label className={`flex items-center justify-between text-[11.5px] ${format === "jpeg" ? "text-[#555]" : "text-[#c9c9c9]"}`}>
              透明背景（PNG / WebP）
              <input type="checkbox" checked={transparent && format !== "jpeg"} disabled={format === "jpeg"} onChange={(e) => setTransparent(e.target.checked)} />
            </label>
            {error && <p className={`text-[11.5px] ${error.endsWith("✓") ? "text-[#7ff0cd]" : "text-[#ff9b9b]"}`}>{error}</p>}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button type="button" disabled={!!busy} onClick={download} className="rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-2 text-[12px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50">
                {busy === "download" ? "匯出中…" : "⬇ 下載"}
              </button>
              <button type="button" disabled={!!busy} onClick={() => toLibrary()} className="rounded-lg bg-[#1f1f1f] px-3 py-2 text-[12px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-50">
                {busy === "library" ? "存檔中…" : "存到資產庫"}
              </button>
              <button type="button" disabled={!!busy} onClick={() => toLibrary("image")} className="rounded-lg bg-[#1f1f1f] px-3 py-2 text-[12px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-50">
                {busy === "image" ? "傳送中…" : "送去圖片生成"}
              </button>
              <button type="button" disabled={!!busy} onClick={() => toLibrary("video")} className="rounded-lg bg-[#1f1f1f] px-3 py-2 text-[12px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-50">
                {busy === "video" ? "傳送中…" : "送去影片生成（當首幀）"}
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-[#6d6d6d]">「送去…」會先把成品存進資產庫，再帶著它跳到生成頁當參考圖。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
