"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronLeft, IconPlus, IconTrash, IconClose } from "@/components/Icons";
import MaskPainter from "@/components/layerEditor/MaskPainter";
import { CANVAS_SIZES, fitLayer, flattenLayers, toDataUrl, type EditorLayer } from "@/lib/layerEditor";

interface AssetLite {
  id: number;
  src: string;
  name: string;
}

type Interaction =
  | { kind: "drag"; id: string; offsetX: number; offsetY: number }
  | { kind: "resize"; id: string; startX: number; startY: number; startW: number; startH: number; startMouseX: number; startMouseY: number }
  | null;

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

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const addLayer = async (src: string, name: string) => {
    try {
      const { w, h } = await naturalSize(src);
      const layer = fitLayer(src, name, canvasSize.width, canvasSize.height, w, h);
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
    setLayers((cur) => cur.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayers((cur) => {
      const i = cur.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "重繪失敗");
      if (!json.url) throw new Error("沒有取得重繪結果");
      updateLayer(maskingLayer.id, { src: json.url });
      setMaskingLayerId(null);
    } catch (e) {
      setRedrawError(e instanceof Error ? e.message : "重繪失敗，請稍後再試");
    } finally {
      setRedrawing(false);
    }
  };

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
                <button type="button" onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }} className="text-[10px] text-[#6d6d6d] hover:text-white" title="顯示/隱藏">
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
                  e.stopPropagation();
                  setSelectedId(l.id);
                  const rect = containerRef.current!.getBoundingClientRect();
                  setInteraction({ kind: "drag", id: l.id, offsetX: e.clientX - rect.left - l.x, offsetY: e.clientY - rect.top - l.y });
                }}
                className={`absolute ${l.visible ? "" : "opacity-30"}`}
                style={{ left: l.x, top: l.y, width: l.width, height: l.height, transform: `rotate(${l.rotation}deg)`, outline: l.id === selectedId ? "2px solid #7ff0cd" : "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.src} alt={l.name} className="h-full w-full select-none object-fill" draggable={false} />
                {l.id === selectedId && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setInteraction({ kind: "resize", id: l.id, startX: l.x, startY: l.y, startW: l.width, startH: l.height, startMouseX: e.clientX, startMouseY: e.clientY });
                    }}
                    className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-black bg-[#7ff0cd]"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* right: properties + AI actions */}
        <div className="flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-[#1c1c1c] p-3">
          {selected ? (
            <div className="space-y-2">
              <div className="text-[11px] text-[#8a8a8a]">選取圖層：{selected.name}</div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[10px] text-[#8a8a8a]">
                  X
                  <input type="number" value={Math.round(selected.x)} onChange={(e) => updateLayer(selected.id, { x: Number(e.target.value) })} className={fieldCls} />
                </label>
                <label className="text-[10px] text-[#8a8a8a]">
                  Y
                  <input type="number" value={Math.round(selected.y)} onChange={(e) => updateLayer(selected.id, { y: Number(e.target.value) })} className={fieldCls} />
                </label>
                <label className="text-[10px] text-[#8a8a8a]">
                  寬
                  <input type="number" value={Math.round(selected.width)} onChange={(e) => updateLayer(selected.id, { width: Math.max(20, Number(e.target.value)) })} className={fieldCls} />
                </label>
                <label className="text-[10px] text-[#8a8a8a]">
                  高
                  <input type="number" value={Math.round(selected.height)} onChange={(e) => updateLayer(selected.id, { height: Math.max(20, Number(e.target.value)) })} className={fieldCls} />
                </label>
              </div>
              <label className="block text-[10px] text-[#8a8a8a]">
                旋轉角度
                <input type="range" min={-180} max={180} value={selected.rotation} onChange={(e) => updateLayer(selected.id, { rotation: Number(e.target.value) })} className="w-full accent-[#7ff0cd]" />
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
