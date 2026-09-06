"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronLeft, IconPlus, IconTrash, IconClose } from "@/components/Icons";
import MaskPainter from "@/components/layerEditor/MaskPainter";
import { CANVAS_SIZES, fitLayer, flattenLayers, newLayerId, toDataUrl, type EditorLayer } from "@/lib/layerEditor";

interface AssetLite {
  id: number;
  src: string;
  name: string;
}

type Interaction =
  | { kind: "drag"; id: string; offsetX: number; offsetY: number }
  | { kind: "resize"; id: string; startX: number; startY: number; startW: number; startH: number; startMouseX: number; startMouseY: number }
  | null;

const ANNOTATION_LAYER_NAME = "標記";
const ANNOTATE_COLOR = "#ff3b3b";

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = src;
  });
}

export default function LayerEditorPage() {
  const [canvasSize, setCanvasSize] = useState(CANVAS_SIZES[0]);
  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetLibrary, setAssetLibrary] = useState<AssetLite[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [maskingLayerId, setMaskingLayerId] = useState<string | null>(null);
  const [redrawing, setRedrawing] = useState(false);
  const [redrawError, setRedrawError] = useState<string | null>(null);

  // ---- 上一步 / 重做 (undo/redo) — one snapshot per user *gesture*, not per
  // pointermove tick: pushed at the start of a drag/resize/field-edit and
  // before every discrete action (add/remove/reorder/toggle/generate/redraw),
  // not on every intermediate update, so undo steps back a whole action at a
  // time instead of one pixel at a time. layersRef mirrors `layers` so async
  // continuations (addLayer, submitRedraw run after an await) always
  // snapshot the latest state instead of a stale render-time closure.
  const [history, setHistory] = useState<EditorLayer[][]>([]);
  const [future, setFuture] = useState<EditorLayer[][]>([]);
  const layersRef = useRef<EditorLayer[]>(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const snapshotHistory = () => {
    setHistory((h) => [...h.slice(-49), layersRef.current]);
    setFuture([]);
  };
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, layers]);
    setLayers(prev);
    setSelectedId((id) => (id && prev.some((l) => l.id === id) ? id : null));
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[future.length - 1];
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, layers]);
    setLayers(next);
    setSelectedId((id) => (id && next.some((l) => l.id === id) ? id : null));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- 圈出要修正的地方 (annotate): a freehand red marker drawn straight onto
  // the canvas and baked in as its own layer before generating. Seedream has
  // no coordinate/region parameter — a positional instruction in plain text
  // ("the area on the left") is not reliably followed (see AdvancedParams'
  // own prompt cheat-sheet) — but a visible mark that's actually part of the
  // image the model sees is a real signal, not just wording. Not separately
  // verified how precisely the model honours it; the prompt hint below says
  // so.
  const [annotating, setAnnotating] = useState(false);
  const annotateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotateDrawing = useRef(false);
  const annotateLast = useRef<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const hasAnnotation = layers.some((l) => l.name === ANNOTATION_LAYER_NAME);

  const addLayer = async (src: string, name: string) => {
    try {
      const { w, h } = await naturalSize(src);
      const layer = fitLayer(src, name, canvasSize.width, canvasSize.height, w, h);
      snapshotHistory();
      setLayers((cur) => [...cur, layer]);
      setSelectedId(layer.id);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "圖片載入失敗");
    }
  };

  const handleUpload = (files: FileList) => {
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") addLayer(reader.result, file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const ensureAssets = () => {
    if (assetLibrary !== null) return;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { assets: AssetLite[] }) => setAssetLibrary(j.assets))
      .catch(() => setAssetLibrary([]));
  };

  const updateLayer = (id: string, patch: Partial<EditorLayer>) =>
    setLayers((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLayer = (id: string) => {
    snapshotHistory();
    setLayers((cur) => cur.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    snapshotHistory();
    setLayers((cur) => {
      const i = cur.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const toggleVisible = (l: EditorLayer) => {
    snapshotHistory();
    updateLayer(l.id, { visible: !l.visible });
  };

  /* ---- drag / resize ---- */
  useEffect(() => {
    if (!interaction) return;
    const onMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (interaction.kind === "drag") {
        const x = e.clientX - rect.left - interaction.offsetX;
        const y = e.clientY - rect.top - interaction.offsetY;
        updateLayer(interaction.id, { x, y });
      } else {
        const dx = e.clientX - interaction.startMouseX;
        const dy = e.clientY - interaction.startMouseY;
        updateLayer(interaction.id, {
          width: Math.max(20, interaction.startW + dx),
          height: Math.max(20, interaction.startH + dy),
        });
      }
    };
    const onUp = () => setInteraction(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [interaction]);

  /* ---- AI 生成/融合 ---- */
  const generate = async () => {
    if (!prompt.trim()) return;
    setGenError(null);
    setGenerating(true);
    try {
      const composite = await flattenLayers(layers, canvasSize.width, canvasSize.height);
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "Dola-Seedream-5.0-pro",
          prompt: prompt.trim(),
          n: 1,
          size: "2048x2048",
          response_format: "url",
          image: layers.length ? composite : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "生成失敗");
      const url = json?.images?.[0]?.url;
      if (!url) throw new Error("沒有取得生成結果");
      await addLayer(url, "AI 生成結果");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "生成失敗，請稍後再試");
    } finally {
      setGenerating(false);
    }
  };

  /* ---- 局部重繪 ---- */
  const maskingLayer = layers.find((l) => l.id === maskingLayerId) ?? null;
  const submitRedraw = async (redrawPrompt: string, maskDataUrl: string) => {
    if (!maskingLayer) return;
    setRedrawError(null);
    setRedrawing(true);
    try {
      const image = await toDataUrl(maskingLayer.src);
      const res = await fetch("/api/images/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: redrawPrompt, image, mask: maskDataUrl }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // A missing/unparseable JSON body here usually means the request
        // never reached our route at all (e.g. Vercel's own ~4.5MB
        // serverless body-size limit rejecting an oversized image+mask
        // payload before our error-handling code ever ran) — surface the
        // HTTP status so this isn't just a bare, undiagnosable "失敗".
        const detail = json?.error?.message || (res.status === 413 ? "圖片太大，請換一張較小的圖片再試" : `重繪失敗（HTTP ${res.status}）`);
        throw new Error(detail);
      }
      if (!json?.url) throw new Error("沒有取得重繪結果");
      snapshotHistory();
      updateLayer(maskingLayer.id, { src: json.url });
      setMaskingLayerId(null);
    } catch (e) {
      setRedrawError(e instanceof Error ? e.message : "重繪失敗，請稍後再試");
    } finally {
      setRedrawing(false);
    }
  };

  /* ---- 圈出要修正的地方 ---- */
  const startAnnotating = () => {
    setSelectedId(null);
    setAnnotating(true);
    requestAnimationFrame(() => {
      const c = annotateCanvasRef.current;
      if (!c) return;
      c.width = canvasSize.width;
      c.height = canvasSize.height;
      c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    });
  };
  const clearAnnotationDrawing = () => {
    const c = annotateCanvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx || !c) return;
    ctx.clearRect(0, 0, c.width, c.height);
  };
  const annotatePointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const paintAnnotation = (x: number, y: number) => {
    const ctx = annotateCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ANNOTATE_COLOR;
    ctx.beginPath();
    if (annotateLast.current) {
      ctx.moveTo(annotateLast.current.x, annotateLast.current.y);
      ctx.lineTo(x, y);
    } else {
      ctx.arc(x, y, 4, 0, Math.PI * 2);
    }
    ctx.stroke();
    annotateLast.current = { x, y };
  };
  const confirmAnnotation = () => {
    const c = annotateCanvasRef.current;
    if (!c) return;
    snapshotHistory();
    setLayers((cur) => [
      ...cur.filter((l) => l.name !== ANNOTATION_LAYER_NAME),
      {
        id: newLayerId(),
        src: c.toDataURL("image/png"),
        name: ANNOTATION_LAYER_NAME,
        x: 0,
        y: 0,
        width: canvasSize.width,
        height: canvasSize.height,
        rotation: 0,
        visible: true,
      },
    ]);
    setAnnotating(false);
  };
  const cancelAnnotation = () => setAnnotating(false);

  const fieldCls = "w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2 py-1 text-[11.5px] text-white focus:border-[#4a4a4a] focus:outline-none";

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[#1c1c1c] bg-black px-4">
        <Link href="/" className="rounded-lg p-1.5 text-[#9a9a9a] transition-colors hover:text-white" aria-label="返回">
          <IconChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-[13px] font-medium text-white">圖層編輯</span>
        <select
          value={canvasSize.label}
          onChange={(e) => setCanvasSize(CANVAS_SIZES.find((s) => s.label === e.target.value) ?? CANVAS_SIZES[0])}
          disabled={layers.length > 0}
          className="h-8 rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2 text-[11.5px] text-white disabled:opacity-40"
          title={layers.length > 0 ? "已經有圖層了，畫布尺寸鎖定（避免既有圖層跑版）" : "選擇畫布尺寸"}
        >
          {CANVAS_SIZES.map((s) => (
            <option key={s.label} value={s.label}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="ml-2 flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!history.length}
            title="上一步（Ctrl+Z）"
            className="rounded-lg px-2 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#1f1f1f] disabled:opacity-30"
          >
            ↶ 上一步
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!future.length}
            title="重做（Ctrl+Y）"
            className="rounded-lg px-2 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#1f1f1f] disabled:opacity-30"
          >
            ↷ 重做
          </button>
        </div>

        <button
          type="button"
          onClick={annotating ? cancelAnnotation : startAnnotating}
          disabled={!layers.length && !annotating}
          title={layers.length ? "在畫面上圈出想修改的地方，生成時會一起參考" : "先加一個圖層才能標記"}
          className={`ml-2 rounded-lg px-2.5 py-1.5 text-[12px] disabled:opacity-30 ${
            annotating ? "bg-[#3a1a1a] text-[#ff9b9b]" : "bg-[#1f1f1f] text-[#c9c9c9] hover:bg-[#282828]"
          }`}
        >
          🖍 {annotating ? "標記中…" : "圈出要修正的地方"}
        </button>

        <span className="hidden text-[11px] text-[#6d6d6d] sm:inline">拖曳圖層移動、右下角拖曳調整大小</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left: layers */}
        <div className="flex w-[220px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-[#1c1c1c] p-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#3a3a3a] bg-[#161616] py-2 text-[12px] text-[#c9c9c9] hover:border-[#555]"
            >
              <IconPlus className="h-3.5 w-3.5" />
              上傳圖片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              ensureAssets();
              setAssetPickerOpen((v) => !v);
            }}
            className="w-full rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]"
          >
            從資產庫選
          </button>
          {assetPickerOpen && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10.5px] text-[#8a8a8a]">選一張加入畫布</span>
                <button type="button" onClick={() => setAssetPickerOpen(false)} className="text-[#8a8a8a] hover:text-white">
                  <IconClose className="h-3 w-3" />
                </button>
              </div>
              <div className="grid max-h-[160px] grid-cols-3 gap-1.5 overflow-y-auto">
                {assetLibrary === null && <span className="col-span-3 py-2 text-center text-[10.5px] text-[#6d6d6d]">載入中…</span>}
                {assetLibrary?.length === 0 && <span className="col-span-3 py-2 text-center text-[10.5px] text-[#6d6d6d]">資產庫還沒有圖片</span>}
                {assetLibrary?.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    title={a.name}
                    onClick={() => addLayer(a.src, a.name)}
                    className="aspect-square overflow-hidden rounded-md border border-[#2a2a2a] hover:border-[#4a4a4a]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-1 border-t border-[#1e1e1e] pt-2 text-[11px] text-[#8a8a8a]">圖層（由上到下 = 由前到後）</div>
          <div className="space-y-1">
            {[...layers].reverse().map((l) => (
              <div
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] ${l.id === selectedId ? "bg-[#1f1f1f] text-white" : "text-[#9a9a9a] hover:bg-[#161616]"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.src} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); toggleVisible(l); }} className="text-[10px] text-[#6d6d6d] hover:text-white" title="顯示/隱藏">
                  {l.visible ? "👁" : "🚫"}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }} className="text-[#6d6d6d] hover:text-white" title="上移一層">↑</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }} className="text-[#6d6d6d] hover:text-white" title="下移一層">↓</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} className="text-[#6d6d6d] hover:text-[#ff8a8a]">
                  <IconTrash className="h-3 w-3" />
                </button>
              </div>
            ))}
            {layers.length === 0 && <p className="px-1 py-3 text-center text-[10.5px] text-[#5c5c5c]">還沒有圖層，先上傳或從資產庫選一張</p>}
          </div>
        </div>

        {/* center: canvas */}
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[#050505] p-6">
          <div
            ref={containerRef}
            onPointerDown={(e) => {
              if (e.target === containerRef.current) setSelectedId(null);
            }}
            className="relative shrink-0 bg-white shadow-2xl"
            style={{ width: canvasSize.width, height: canvasSize.height }}
          >
            {layers.map((l) => (
              <div
                key={l.id}
                onPointerDown={(e) => {
                  if (annotating) return;
                  e.stopPropagation();
                  setSelectedId(l.id);
                  snapshotHistory();
                  const rect = containerRef.current!.getBoundingClientRect();
                  setInteraction({ kind: "drag", id: l.id, offsetX: e.clientX - rect.left - l.x, offsetY: e.clientY - rect.top - l.y });
                }}
                className={`absolute ${l.visible ? "" : "opacity-30"}`}
                style={{ left: l.x, top: l.y, width: l.width, height: l.height, transform: `rotate(${l.rotation}deg)`, outline: l.id === selectedId ? "2px solid #7ff0cd" : "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.src} alt={l.name} className="h-full w-full select-none object-fill" draggable={false} />
                {l.id === selectedId && !annotating && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      snapshotHistory();
                      setInteraction({ kind: "resize", id: l.id, startX: l.x, startY: l.y, startW: l.width, startH: l.height, startMouseX: e.clientX, startMouseY: e.clientY });
                    }}
                    className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-black bg-[#7ff0cd]"
                  />
                )}
              </div>
            ))}

            {annotating && (
              <canvas
                ref={annotateCanvasRef}
                className="absolute inset-0 cursor-crosshair"
                onPointerDown={(e) => {
                  annotateDrawing.current = true;
                  annotateLast.current = null;
                  const p = annotatePointerPos(e);
                  paintAnnotation(p.x, p.y);
                }}
                onPointerMove={(e) => {
                  if (!annotateDrawing.current) return;
                  const p = annotatePointerPos(e);
                  paintAnnotation(p.x, p.y);
                }}
                onPointerUp={() => {
                  annotateDrawing.current = false;
                  annotateLast.current = null;
                }}
                onPointerLeave={() => {
                  annotateDrawing.current = false;
                  annotateLast.current = null;
                }}
              />
            )}
          </div>
        </div>

        {/* right: properties + AI actions */}
        <div className="flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-[#1c1c1c] p-3">
          {annotating ? (
            <div className="space-y-2">
              <div className="text-[11px] text-[#8a8a8a]">在畫面上圈出想修改的地方</div>
              <p className="text-[10.5px] leading-relaxed text-[#6d6d6d]">
                用滑鼠在畫布上塗畫，紅色標記會變成一個圖層跟畫面一起送給模型，之後在下面 prompt 裡描述「紅圈的地方想改成什麼」——
                模型看得到這個標記，但不保證完全照著範圍修改，效果請以生成結果為準。
              </p>
              <button type="button" onClick={clearAnnotationDrawing} className="w-full rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">
                清除塗畫
              </button>
              <div className="flex gap-1.5">
                <button type="button" onClick={cancelAnnotation} className="flex-1 rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmAnnotation}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-1.5 text-[12px] font-medium text-[#0a1a16] hover:brightness-105"
                >
                  完成標記
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-2">
              <div className="text-[11px] text-[#8a8a8a]">選取圖層：{selected.name}</div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[10px] text-[#8a8a8a]">
                  X
                  <input type="number" value={Math.round(selected.x)} onFocus={snapshotHistory} onChange={(e) => updateLayer(selected.id, { x: Number(e.target.value) })} className={fieldCls} />
                </label>
                <label className="text-[10px] text-[#8a8a8a]">
                  Y
                  <input type="number" value={Math.round(selected.y)} onFocus={snapshotHistory} onChange={(e) => updateLayer(selected.id, { y: Number(e.target.value) })} className={fieldCls} />
                </label>
                <label className="text-[10px] text-[#8a8a8a]">
                  寬
                  <input type="number" value={Math.round(selected.width)} onFocus={snapshotHistory} onChange={(e) => updateLayer(selected.id, { width: Math.max(20, Number(e.target.value)) })} className={fieldCls} />
                </label>
                <label className="text-[10px] text-[#8a8a8a]">
                  高
                  <input type="number" value={Math.round(selected.height)} onFocus={snapshotHistory} onChange={(e) => updateLayer(selected.id, { height: Math.max(20, Number(e.target.value)) })} className={fieldCls} />
                </label>
              </div>
              <label className="block text-[10px] text-[#8a8a8a]">
                旋轉角度
                <input type="range" min={-180} max={180} value={selected.rotation} onPointerDown={snapshotHistory} onChange={(e) => updateLayer(selected.id, { rotation: Number(e.target.value) })} className="w-full accent-[#7ff0cd]" />
              </label>
              <button
                type="button"
                onClick={() => setMaskingLayerId(selected.id)}
                className="w-full rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]"
              >
                局部重繪這個圖層
              </button>
            </div>
          ) : (
            <p className="text-[11.5px] text-[#6d6d6d]">選一個圖層可以調整位置、大小、旋轉，或開始局部重繪</p>
          )}

          <div className="border-t border-[#1e1e1e] pt-3">
            <div className="mb-1.5 text-[11px] text-[#8a8a8a]">AI 生成 / 融合</div>
            {hasAnnotation && (
              <p className="mb-1.5 text-[10.5px] leading-relaxed text-[#ff9b9b]">
                畫面上有紅色標記——記得在下面描述「紅圈的地方想改成什麼」，模型才知道那個標記代表什麼意思。
              </p>
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述想生成的畫面（會把目前畫布上的排版當參考）"
              rows={4}
              className="w-full resize-none rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] text-white focus:border-[#4a4a4a] focus:outline-none"
              style={{ maxHeight: 160 }}
            />
            {genError && <p className="mt-1.5 text-[11px] text-[#ff9b9b]">{genError}</p>}
            <button
              type="button"
              onClick={generate}
              disabled={generating || !prompt.trim()}
              className="mt-1.5 w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-2 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50"
            >
              {generating ? "生成中…" : "生成新圖層"}
            </button>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[#6d6d6d]">
              固定使用 Seedream 5.0 pro。畫布上的排版是給 AI 的參考構圖，不是像素級合成——模型會參考畫面內容跟大致構圖，
              不保證每個圖層的精確位置都照抄，結果請以生成畫面為準。
            </p>
          </div>
        </div>
      </div>

      {maskingLayer && (
        <MaskPainter
          imageSrc={maskingLayer.src}
          onCancel={() => setMaskingLayerId(null)}
          onSubmit={submitRedraw}
          submitting={redrawing}
          errorMessage={redrawError}
        />
      )}
    </div>
  );
}
