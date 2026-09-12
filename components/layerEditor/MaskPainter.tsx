"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose, IconTrash } from "../Icons";
import { loadImage } from "@/lib/layerEditor";
import { prepareSmartSelect, type SmartSelectSession } from "./models";

/**
 * Paints masks over one layer's image and submits 局部重繪 (local redraw)
 * requests. The selection is kept as an opaque-red "selected" canvas and
 * converted at submit time to the mask SIRAYA's /images/edits expects:
 * transparent = "edit here", opaque = "keep". CONFIRMED correct, not just
 * assumed: a real E2E test (2026-09-06) painted a precise circular mask over
 * a photo and asked for a specific object in the center — the result showed
 * that exact object appearing only inside the painted circle, with the rest
 * pixel-for-pixel untouched.
 *
 * Tools: brush / eraser (size), rectangle, lasso, 點選物件 (SlimSAM in the
 * browser — see models.ts), plus feather, invert, undo, and a region list
 * so several areas can each get their own prompt and be submitted as one
 * batch — the parent runs them sequentially and stacks each result as its
 * own layer.
 */

export interface RedrawRegion {
  id: string;
  prompt: string;
  /** mask data URL in SIRAYA's convention (transparent = edit) */
  mask: string;
  /** small preview of the selection for the list */
  thumb: string;
}

type Tool = "brush" | "eraser" | "rect" | "lasso" | "smart";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "brush", label: "筆刷", hint: "塗抹要重畫的區域" },
  { id: "eraser", label: "橡皮擦", hint: "擦掉多塗的部分" },
  { id: "rect", label: "矩形", hint: "拖出一個矩形範圍" },
  { id: "lasso", label: "套索", hint: "沿著物件邊緣畫一圈" },
  { id: "smart", label: "點選物件", hint: "點一下自動選取整個物件（Shift+點＝從選取中扣除）" },
];

const SEL_COLOR = "rgba(255, 64, 64, 1)";

export default function MaskPainter({
  imageSrc,
  onCancel,
  onSubmit,
  submitting,
  errorMessage,
}: {
  imageSrc: string;
  onCancel: () => void;
  /** one or more regions, each with its own prompt */
  onSubmit: (regions: { prompt: string; mask: string }[]) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 640, h: 480 });
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(36);
  const [feather, setFeather] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [regions, setRegions] = useState<RedrawRegion[]>([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [smartStatus, setSmartStatus] = useState<string | null>(null);
  const smartRef = useRef<SmartSelectSession | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const lassoRef = useRef<{ x: number; y: number }[]>([]);
  const baseSnapshotRef = useRef<ImageData | null>(null);

  useEffect(() => {
    let alive = true;
    loadImage(imageSrc).then((img) => {
      if (!alive) return;
      const maxW = Math.min(900, window.innerWidth - 420);
      const maxH = window.innerHeight - 140;
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
        const s = selCanvasRef.current;
        if (s) {
          s.width = w;
          s.height = h;
        }
        const p = previewRef.current;
        if (p) {
          p.width = w;
          p.height = h;
        }
      });
    });
    return () => {
      alive = false;
    };
  }, [imageSrc]);

  const selCtx = () => selCanvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;

  const refreshPreview = useCallback(() => {
    const s = selCanvasRef.current;
    const p = previewRef.current;
    const ctx = p?.getContext("2d");
    if (!s || !p || !ctx) return;
    ctx.clearRect(0, 0, p.width, p.height);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(s, 0, 0);
    ctx.globalAlpha = 1;
    // any selected pixel?
    const data = s.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, s.width, s.height).data;
    let any = false;
    for (let i = 3; i < data.length; i += 4 * 7) {
      if (data[i] > 0) {
        any = true;
        break;
      }
    }
    setHasSelection(any);
  }, []);

  const pushUndo = () => {
    const ctx = selCtx();
    const s = selCanvasRef.current;
    if (!ctx || !s) return;
    setUndoStack((st) => [...st.slice(-19), ctx.getImageData(0, 0, s.width, s.height)]);
  };
  const undo = () => {
    const ctx = selCtx();
    if (!ctx || !undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((st) => st.slice(0, -1));
    ctx.putImageData(last, 0, 0);
    refreshPreview();
  };

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const strokeTo = (x: number, y: number) => {
    const ctx = selCtx();
    if (!ctx) return;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = SEL_COLOR;
    ctx.fillStyle = SEL_COLOR;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brush;
    ctx.beginPath();
    if (lastRef.current) {
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastRef.current = { x, y };
  };

  const drawShapePreview = (x: number, y: number) => {
    const ctx = selCtx();
    const start = shapeStartRef.current;
    if (!ctx || !start || !baseSnapshotRef.current) return;
    ctx.putImageData(baseSnapshotRef.current, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = SEL_COLOR;
    if (tool === "rect") {
      ctx.fillRect(Math.min(start.x, x), Math.min(start.y, y), Math.abs(x - start.x), Math.abs(y - start.y));
    } else {
      lassoRef.current.push({ x, y });
      const pts = lassoRef.current;
      if (pts.length > 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  const smartClick = async (x: number, y: number, subtract: boolean) => {
    const s = selCanvasRef.current;
    const ctx = selCtx();
    if (!s || !ctx) return;
    try {
      if (!smartRef.current) {
        smartRef.current = await prepareSmartSelect(imgCanvasRef.current!.toDataURL("image/png"), (m) => setSmartStatus(m));
      }
      const session = smartRef.current;
      setSmartStatus("計算選取範圍…");
      const mask = await session.maskAt([{ x: (x / s.width) * session.width, y: (y / s.height) * session.height, label: 1 }]);
      pushUndo();
      // paint the mask (session resolution) onto the selection canvas
      const tmp = document.createElement("canvas");
      tmp.width = session.width;
      tmp.height = session.height;
      const tctx = tmp.getContext("2d")!;
      const id = tctx.createImageData(session.width, session.height);
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          id.data[i * 4] = 255;
          id.data[i * 4 + 1] = 64;
          id.data[i * 4 + 2] = 64;
          id.data[i * 4 + 3] = 255;
        }
      }
      tctx.putImageData(id, 0, 0);
      ctx.globalCompositeOperation = subtract ? "destination-out" : "source-over";
      ctx.drawImage(tmp, 0, 0, s.width, s.height);
      ctx.globalCompositeOperation = "source-over";
      refreshPreview();
      setSmartStatus(subtract ? "已從選取中扣除" : "已加入選取（Shift+點可扣除）");
    } catch (e) {
      setSmartStatus(e instanceof Error ? e.message : "智慧選取失敗");
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (tool === "smart") {
      void smartClick(p.x, p.y, e.shiftKey);
      return;
    }
    pushUndo();
    drawingRef.current = true;
    if (tool === "brush" || tool === "eraser") {
      lastRef.current = null;
      strokeTo(p.x, p.y);
    } else {
      const ctx = selCtx();
      const s = selCanvasRef.current;
      if (!ctx || !s) return;
      baseSnapshotRef.current = ctx.getImageData(0, 0, s.width, s.height);
      shapeStartRef.current = p;
      lassoRef.current = [p];
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const p = pointerPos(e);
    if (tool === "brush" || tool === "eraser") strokeTo(p.x, p.y);
    else drawShapePreview(p.x, p.y);
    refreshPreview();
  };
  const onUp = () => {
    drawingRef.current = false;
    lastRef.current = null;
    shapeStartRef.current = null;
    lassoRef.current = [];
    baseSnapshotRef.current = null;
    refreshPreview();
  };

  const clearSelection = () => {
    const ctx = selCtx();
    const s = selCanvasRef.current;
    if (!ctx || !s) return;
    pushUndo();
    ctx.clearRect(0, 0, s.width, s.height);
    refreshPreview();
  };

  const invertSelection = () => {
    const ctx = selCtx();
    const s = selCanvasRef.current;
    if (!ctx || !s) return;
    pushUndo();
    const id = ctx.getImageData(0, 0, s.width, s.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const a = id.data[i + 3];
      id.data[i] = 255;
      id.data[i + 1] = 64;
      id.data[i + 2] = 64;
      id.data[i + 3] = 255 - a;
    }
    ctx.putImageData(id, 0, 0);
    refreshPreview();
  };

  /** Converts the red selection into SIRAYA's mask (transparent = edit), feathered if asked. */
  const buildMask = (): string | null => {
    const s = selCanvasRef.current;
    if (!s) return null;
    const m = document.createElement("canvas");
    m.width = s.width;
    m.height = s.height;
    const ctx = m.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, m.width, m.height);
    ctx.globalCompositeOperation = "destination-out";
    if (feather > 0) ctx.filter = `blur(${feather}px)`;
    ctx.drawImage(s, 0, 0);
    return m.toDataURL("image/png");
  };

  const selectionThumb = (): string => {
    const s = selCanvasRef.current;
    const img = imgCanvasRef.current;
    const t = document.createElement("canvas");
    t.width = 96;
    t.height = 72;
    const ctx = t.getContext("2d")!;
    if (img) ctx.drawImage(img, 0, 0, t.width, t.height);
    if (s) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(s, 0, 0, t.width, t.height);
    }
    return t.toDataURL("image/jpeg", 0.7);
  };

  const addRegion = () => {
    const mask = buildMask();
    if (!mask || !hasSelection || !prompt.trim()) return;
    setRegions((r) => [...r, { id: `r${Date.now()}`, prompt: prompt.trim(), mask, thumb: selectionThumb() }]);
    setPrompt("");
    clearSelection();
  };

  const submit = () => {
    const batch: { prompt: string; mask: string }[] = regions.map((r) => ({ prompt: r.prompt, mask: r.mask }));
    if (hasSelection && prompt.trim()) {
      const mask = buildMask();
      if (mask) batch.push({ prompt: prompt.trim(), mask });
    }
    if (!batch.length) return;
    onSubmit(batch);
  };

  const canSubmit = regions.length > 0 || (hasSelection && prompt.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1c] px-4">
        <span className="text-[13px] font-medium text-white">局部重繪</span>
        <span className="text-[11px] text-[#6d6d6d]">選出想重畫的區域，其他地方會盡量保持不變</span>
        <button type="button" onClick={onCancel} aria-label="關閉" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-white">
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* tools */}
        <div className="flex w-[150px] shrink-0 flex-col gap-1 border-r border-[#1c1c1c] p-3">
          <div className="mb-1 text-[10.5px] text-[#8a8a8a]">工具</div>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              onClick={() => setTool(t.id)}
              className={`rounded-lg px-2 py-1.5 text-left text-[11.5px] ${tool === t.id ? "bg-[#233a34] text-[#7ff0cd]" : "bg-[#161616] text-[#c9c9c9] hover:bg-[#222]"}`}
            >
              {t.label}
            </button>
          ))}
          <div className="mt-2 border-t border-[#1e1e1e] pt-2">
            <label className="block text-[10px] text-[#8a8a8a]">
              筆刷大小 <span className="text-[#c9c9c9]">{brush}</span>
              <input type="range" min={4} max={160} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-full accent-[#7ff0cd]" />
            </label>
            <label className="block text-[10px] text-[#8a8a8a]">
              羽化邊緣 <span className="text-[#c9c9c9]">{feather}px</span>
              <input type="range" min={0} max={40} value={feather} onChange={(e) => setFeather(Number(e.target.value))} className="w-full accent-[#7ff0cd]" />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button type="button" onClick={undo} disabled={!undoStack.length} className="rounded-md bg-[#1f1f1f] px-1.5 py-1 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40">
              ↶ 復原
            </button>
            <button type="button" onClick={invertSelection} className="rounded-md bg-[#1f1f1f] px-1.5 py-1 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]">
              反轉
            </button>
            <button type="button" onClick={clearSelection} className="col-span-2 rounded-md bg-[#1f1f1f] px-1.5 py-1 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]">
              清除選取
            </button>
          </div>
          {tool === "smart" && (
            <p className="mt-2 text-[10px] leading-relaxed text-[#8daba1]">
              {smartStatus ?? "第一次使用會下載約 14MB 的模型（之後免下載），全程在你的瀏覽器裡計算，不花點數。"}
            </p>
          )}
        </div>

        {/* canvas */}
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-4">
          <div className="relative shrink-0" style={{ width: size.w, height: size.h }}>
            <canvas ref={imgCanvasRef} className="absolute inset-0 rounded-lg" />
            <canvas ref={previewRef} className="pointer-events-none absolute inset-0 rounded-lg" />
            <canvas
              ref={selCanvasRef}
              className={`absolute inset-0 rounded-lg opacity-0 ${tool === "smart" ? "cursor-pointer" : "cursor-crosshair"}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
            />
          </div>
        </div>

        {/* prompt + regions */}
        <div className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#1c1c1c] p-3">
          <label className="block">
            <div className="mb-1 text-[11px] text-[#8a8a8a]">選取的地方要改成什麼</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="例如：把這裡換成藍天白雲"
              className="w-full resize-none rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] text-white focus:border-[#4a4a4a] focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={addRegion}
            disabled={!hasSelection || !prompt.trim()}
            className="w-full rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40"
            title="把目前的選取＋描述存成一個區域，然後可以繼續選下一個區域"
          >
            ＋ 存成區域，繼續選下一個
          </button>

          {regions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10.5px] text-[#8a8a8a]">批次區域（{regions.length}）— 會依序送出，每個結果各成一層</div>
              {regions.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2 rounded-lg bg-[#161616] p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.thumb} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-[#8a8a8a]">區域 {i + 1}</div>
                    <div className="truncate text-[11px] text-[#d8d8d8]" title={r.prompt}>
                      {r.prompt}
                    </div>
                  </div>
                  <button type="button" onClick={() => setRegions((cur) => cur.filter((x) => x.id !== r.id))} className="text-[#6d6d6d] hover:text-[#ff8a8a]" aria-label="移除區域">
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {errorMessage && <p className="text-[11.5px] text-[#ff9b9b]">{errorMessage}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !canSubmit}
            className="w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-2 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50"
          >
            {submitting ? "重繪中…" : regions.length + (hasSelection && prompt.trim() ? 1 : 0) > 1 ? `開始重繪（${regions.length + (hasSelection && prompt.trim() ? 1 : 0)} 個區域）` : "開始重繪"}
          </button>
          <p className="text-[10px] leading-relaxed text-[#6d6d6d]">
            固定使用 Seedream 5.0 pro，每個區域各算一次點數。羽化會讓邊界過渡更自然；「反轉」可以改成「除了選取處都重畫」。重繪後可以在圖層面板用「比對」看前後差異、不滿意一鍵回復。
          </p>
        </div>
      </div>
    </div>
  );
}
