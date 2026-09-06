"use client";

import { useEffect, useRef, useState } from "react";
import { IconClose } from "../Icons";

/**
 * Paints a mask over one layer's image and submits a 局部重繪 (local redraw)
 * request. Brush strokes erase the mask canvas to transparent — SIRAYA's
 * docs describe mask_url only as "marks the region to edit" without
 * spelling out the exact black/white/alpha convention; this follows the
 * common (OpenAI-style) one — transparent = "edit here", opaque = "keep" —
 * since gpt-image-1 is documented as compatible with this same endpoint.
 * CONFIRMED correct, not just assumed: a real E2E test (2026-09-06) painted
 * a precise circular mask over a photo and asked for a specific object in
 * the center — the result showed that exact object appearing only inside
 * the painted (transparent) circle, with the rest of the photo pixel-for-
 * pixel untouched. If it were inverted, the edit would have covered
 * everything EXCEPT the circle instead.
 */
export default function MaskPainter({
  imageSrc,
  onCancel,
  onSubmit,
  submitting,
  errorMessage,
}: {
  imageSrc: string;
  onCancel: () => void;
  onSubmit: (prompt: string, maskDataUrl: string) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 640, h: 480 });
  const [brush, setBrush] = useState(36);
  const [prompt, setPrompt] = useState("");
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxW = 720;
      const maxH = 560;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      setSize({ w, h });
      requestAnimationFrame(() => {
        const c = imgCanvasRef.current;
        if (!c) return;
        c.width = w;
        c.height = h;
        c.getContext("2d")?.drawImage(img, 0, 0, w, h);
        const m = maskCanvasRef.current;
        if (m) {
          m.width = w;
          m.height = h;
          const mctx = m.getContext("2d");
          if (mctx) {
            mctx.fillStyle = "#000";
            mctx.fillRect(0, 0, w, h);
          }
        }
      });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const paintAt = (x: number, y: number) => {
    const m = maskCanvasRef.current;
    const ctx = m?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    if (lastRef.current) {
      ctx.lineWidth = brush;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#fff";
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastRef.current = { x, y };
  };

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const clearMask = () => {
    const m = maskCanvasRef.current;
    const ctx = m?.getContext("2d");
    if (!ctx || !m) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, m.width, m.height);
  };

  const submit = () => {
    const m = maskCanvasRef.current;
    if (!m || !prompt.trim()) return;
    onSubmit(prompt.trim(), m.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1c] px-4">
        <span className="text-[13px] font-medium text-white">局部重繪</span>
        <span className="text-[11px] text-[#6d6d6d]">塗抹想重畫的區域，其他地方會盡量保持不變</span>
        <button type="button" onClick={onCancel} aria-label="關閉" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-white">
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center gap-6 overflow-auto p-6">
        <div className="relative shrink-0" style={{ width: size.w, height: size.h }}>
          <canvas ref={imgCanvasRef} className="absolute inset-0 rounded-lg" />
          <canvas
            ref={maskCanvasRef}
            className="absolute inset-0 cursor-crosshair rounded-lg opacity-60"
            onPointerDown={(e) => {
              drawingRef.current = true;
              lastRef.current = null;
              const p = pointerPos(e);
              paintAt(p.x, p.y);
            }}
            onPointerMove={(e) => {
              if (!drawingRef.current) return;
              const p = pointerPos(e);
              paintAt(p.x, p.y);
            }}
            onPointerUp={() => {
              drawingRef.current = false;
              lastRef.current = null;
            }}
            onPointerLeave={() => {
              drawingRef.current = false;
              lastRef.current = null;
            }}
          />
        </div>

        <div className="w-[280px] shrink-0 space-y-3">
          <label className="block">
            <div className="mb-1 text-[11px] text-[#8a8a8a]">筆刷大小</div>
            <input type="range" min={8} max={100} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-full accent-[#7ff0cd]" />
          </label>
          <button type="button" onClick={clearMask} className="w-full rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">
            清除塗抹範圍
          </button>
          <label className="block">
            <div className="mb-1 text-[11px] text-[#8a8a8a]">想把塗抹的地方改成什麼</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="例如：把這裡換成藍天白雲"
              className="w-full resize-none rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] text-white focus:border-[#4a4a4a] focus:outline-none"
              style={{ maxHeight: 160 }}
            />
          </label>
          {errorMessage && <p className="text-[11.5px] text-[#ff9b9b]">{errorMessage}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !prompt.trim()}
            className="w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-2 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50"
          >
            {submitting ? "重繪中…" : "開始重繪"}
          </button>
          <p className="text-[10px] leading-relaxed text-[#6d6d6d]">
            固定使用 Seedream 5.0 pro。塗抹範圍是概略的遮罩，不是像素級精準去背，實際效果請以生成結果為準。
          </p>
        </div>
      </div>
    </div>
  );
}
