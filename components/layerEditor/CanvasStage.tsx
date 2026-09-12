"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { FULL_CROP, DEFAULT_TEXT_STYLE, filterString, snapRect, type EditorDoc, type EditorLayer, type Guide } from "@/lib/layerEditor";

export type StageMode = "select" | "annotate" | "crop";

/** Canvas-unit rect the crop tool is editing (the part of the layer to keep). */
export interface CropDraft {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: { id: Handle; cursor: string; style: React.CSSProperties }[] = [
  { id: "nw", cursor: "nwse-resize", style: { left: 0, top: 0 } },
  { id: "n", cursor: "ns-resize", style: { left: "50%", top: 0 } },
  { id: "ne", cursor: "nesw-resize", style: { left: "100%", top: 0 } },
  { id: "e", cursor: "ew-resize", style: { left: "100%", top: "50%" } },
  { id: "se", cursor: "nwse-resize", style: { left: "100%", top: "100%" } },
  { id: "s", cursor: "ns-resize", style: { left: "50%", top: "100%" } },
  { id: "sw", cursor: "nesw-resize", style: { left: 0, top: "100%" } },
  { id: "w", cursor: "ew-resize", style: { left: 0, top: "50%" } },
];

type Interaction =
  | { kind: "drag"; id: string; offsetX: number; offsetY: number }
  | { kind: "resize"; id: string; handle: Handle; start: { x: number; y: number; width: number; height: number }; startMouse: { x: number; y: number }; aspect: number }
  | { kind: "rotate"; id: string; cx: number; cy: number; startAngle: number; startRotation: number }
  | { kind: "crop-move"; offsetX: number; offsetY: number }
  | { kind: "crop-resize"; handle: Handle; start: CropDraft; startMouse: { x: number; y: number } }
  | null;

const SNAP_PX = 6;
const CHECKER: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  backgroundImage: "linear-gradient(45deg,#2a2a2a 25%,transparent 25%),linear-gradient(-45deg,#2a2a2a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2a 75%),linear-gradient(-45deg,transparent 75%,#2a2a2a 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
};

function resizeRect(start: { x: number; y: number; width: number; height: number }, handle: Handle, dx: number, dy: number, keepAspect: boolean, aspect: number) {
  let { x, y, width, height } = start;
  if (handle.includes("e")) width = Math.max(4, start.width + dx);
  if (handle.includes("s")) height = Math.max(4, start.height + dy);
  if (handle.includes("w")) {
    width = Math.max(4, start.width - dx);
    x = start.x + start.width - width;
  }
  if (handle.includes("n")) {
    height = Math.max(4, start.height - dy);
    y = start.y + start.height - height;
  }
  if (keepAspect && handle.length === 2) {
    // corner with Shift: follow the larger change, anchor the opposite corner
    if (Math.abs(width - start.width) > Math.abs(height - start.height) * aspect) height = width / aspect;
    else width = height * aspect;
    if (handle.includes("w")) x = start.x + start.width - width;
    if (handle.includes("n")) y = start.y + start.height - height;
  }
  return { x, y, width, height };
}

/**
 * The editable canvas: layers as positioned DOM elements (so the browser
 * does the compositing live — the same properties renderDoc bakes for
 * export), with drag / 8-handle resize (Shift = keep aspect) / rotate
 * handle, smart guides + snapping to the canvas and other layers, zoom via
 * CSS transform, a crop overlay, and the freehand 標記 canvas.
 */
export default function CanvasStage({
  doc,
  selectedId,
  zoom,
  mode,
  cropDraft,
  annotateCanvasRef,
  onSelect,
  onSnapshot,
  onPatch,
  onCropDraft,
  onZoom,
  onDropFiles,
  fitRequest,
}: {
  doc: EditorDoc;
  selectedId: string | null;
  zoom: number;
  mode: StageMode;
  cropDraft: CropDraft | null;
  annotateCanvasRef: RefObject<HTMLCanvasElement | null>;
  onSelect: (id: string | null) => void;
  onSnapshot: () => void;
  onPatch: (id: string, patch: Partial<EditorLayer>) => void;
  onCropDraft: (draft: CropDraft) => void;
  onZoom: (zoom: number) => void;
  onDropFiles: (files: FileList) => void;
  /** bump to zoom-to-fit the whole canvas in the viewport (also runs on mount and whenever the canvas size changes) */
  fitRequest: number;
}) {
  const { canvas, layers } = doc;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // The live interaction lives in a ref (read by window listeners attached
  // once on mount) — attaching listeners in an effect keyed on state left a
  // window between pointerdown and React's commit where fast pointermoves
  // were lost, which showed up as a resize/crop drag doing nothing when the
  // machine was busy. State mirrors it only for re-rendering.
  const interactionRef = useRef<Interaction>(null);
  const [, setInteractionState] = useState<Interaction>(null);
  const setInteraction = (i: Interaction) => {
    interactionRef.current = i;
    setInteractionState(i);
  };
  const [guides, setGuides] = useState<Guide[]>([]);
  const [panning, setPanning] = useState(false);
  const spaceRef = useRef(false);
  const annotateDrawing = useRef(false);
  const annotateLast = useRef<{ x: number; y: number } | null>(null);

  const zoomRef = useRef(zoom);
  // latest props for the mount-once listeners (written in an effect, not during render)
  const latest = useRef({ layers, canvas, cropDraft, onPatch, onCropDraft });
  useEffect(() => {
    zoomRef.current = zoom;
    latest.current = { layers, canvas, cropDraft, onPatch, onCropDraft };
  });
  const toCanvas = (clientX: number, clientY: number) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoomRef.current, y: (clientY - rect.top) / zoomRef.current };
  };

  /* ---- zoom to fit — real bug found in the 2026-09-12 E2E: at 100% a
     1024px canvas overflowed a 1600px window's centre column, so the
     bottom-right resize handle sat under the container's own scrollbar and
     couldn't be grabbed at all. Fit on mount / canvas-size change / request. */
  const onZoomRef = useRef(onZoom);
  useEffect(() => {
    onZoomRef.current = onZoom;
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fit = Math.min(1, (el.clientWidth - 80) / canvas.width, (el.clientHeight - 80) / canvas.height);
    onZoomRef.current(Math.max(0.1, Math.round(fit * 100) / 100));
  }, [fitRequest, canvas.width, canvas.height]);

  /* ---- zoom with ctrl+wheel, pan with space+drag ---- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      onZoom(Math.min(4, Math.max(0.1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, onZoom]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        spaceRef.current = true;
        setPanning(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setPanning(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  /* ---- drag / resize / rotate / crop ---- */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || !stageRef.current) return;
      const { layers, canvas, cropDraft, onPatch, onCropDraft } = latest.current;
      const p = toCanvas(e.clientX, e.clientY);
      if (interaction.kind === "drag") {
        const layer = layers.find((l) => l.id === interaction.id);
        if (!layer) return;
        let x = p.x - interaction.offsetX;
        let y = p.y - interaction.offsetY;
        if (!e.altKey) {
          const others = layers.filter((l) => l.id !== layer.id && l.visible);
          const snapped = snapRect({ x, y, width: layer.width, height: layer.height }, others, canvas, SNAP_PX / zoomRef.current);
          x = snapped.x;
          y = snapped.y;
          setGuides(snapped.guides);
        } else setGuides([]);
        onPatch(interaction.id, { x, y });
      } else if (interaction.kind === "resize") {
        onPatch(interaction.id, resizeRect(interaction.start, interaction.handle, p.x - interaction.startMouse.x, p.y - interaction.startMouse.y, e.shiftKey, interaction.aspect));
      } else if (interaction.kind === "rotate") {
        const angle = (Math.atan2(p.y - interaction.cy, p.x - interaction.cx) * 180) / Math.PI;
        let rotation = interaction.startRotation + (angle - interaction.startAngle);
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
        onPatch(interaction.id, { rotation });
      } else if (interaction.kind === "crop-move" && cropDraft) {
        onCropDraft({ ...cropDraft, x: p.x - interaction.offsetX, y: p.y - interaction.offsetY });
      } else if (interaction.kind === "crop-resize") {
        onCropDraft(resizeRect(interaction.start, interaction.handle, p.x - interaction.startMouse.x, p.y - interaction.startMouse.y, e.shiftKey, interaction.start.width / interaction.start.height));
      }
    };
    const onUp = () => {
      if (!interactionRef.current) return;
      setInteraction(null);
      setGuides([]);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // mount-once: everything it needs is read from refs
  }, []);

  /* ---- 標記 freehand ---- */
  const paintAnnotation = (x: number, y: number) => {
    const ctx = annotateCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ff3b3b";
    ctx.fillStyle = "#ff3b3b";
    ctx.beginPath();
    if (annotateLast.current) {
      ctx.moveTo(annotateLast.current.x, annotateLast.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    annotateLast.current = { x, y };
  };

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const cropLayer = mode === "crop" && selected && selected.kind === "image" ? selected : null;
  // in crop mode the layer's full (uncropped) source is shown unrotated so the draft rect maps 1:1
  const cropFull = cropLayer
    ? (() => {
        const c = cropLayer.crop ?? FULL_CROP;
        const fullW = cropLayer.width / c.w;
        const fullH = cropLayer.height / c.h;
        return { x: cropLayer.x - c.x * fullW, y: cropLayer.y - c.y * fullH, width: fullW, height: fullH };
      })()
    : null;

  return (
    <div
      ref={scrollRef}
      className={`relative min-w-0 flex-1 overflow-auto bg-[#050505] ${panning ? "cursor-grab" : ""}`}
      onPointerDown={(e) => {
        if (spaceRef.current && scrollRef.current) {
          panRef.current = { x: e.clientX, y: e.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop };
          e.preventDefault();
        }
      }}
      onPointerMove={(e) => {
        if (panRef.current && scrollRef.current) {
          scrollRef.current.scrollLeft = panRef.current.left - (e.clientX - panRef.current.x);
          scrollRef.current.scrollTop = panRef.current.top - (e.clientY - panRef.current.y);
        }
      }}
      onPointerUp={() => (panRef.current = null)}
      onPointerLeave={() => (panRef.current = null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: canvas.width * zoom + 64, height: canvas.height * zoom + 64 }}>
        <div
          ref={stageRef}
          onPointerDown={(e) => {
            if (e.target === stageRef.current && mode === "select") onSelect(null);
          }}
          className="relative shrink-0 shadow-2xl"
          style={{ width: canvas.width, height: canvas.height, transform: `scale(${zoom})`, transformOrigin: "top left", ...(canvas.background === "transparent" ? CHECKER : { backgroundColor: canvas.background }) }}
        >
          {layers.map((l) => {
            const isCropTarget = cropLayer?.id === l.id && cropFull;
            const rect = isCropTarget ? cropFull! : l;
            const c = isCropTarget ? FULL_CROP : (l.crop ?? FULL_CROP);
            const t = l.text ?? DEFAULT_TEXT_STYLE;
            return (
              <div
                key={l.id}
                onPointerDown={(e) => {
                  if (mode !== "select" || spaceRef.current) return;
                  e.stopPropagation();
                  onSelect(l.id);
                  if (l.locked) return;
                  onSnapshot();
                  const p = toCanvas(e.clientX, e.clientY);
                  setInteraction({ kind: "drag", id: l.id, offsetX: p.x - l.x, offsetY: p.y - l.y });
                }}
                className="absolute"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  transform: isCropTarget ? "none" : `rotate(${l.rotation}deg)`,
                  opacity: (l.visible ? (l.opacity ?? 1) : 0.25) * (isCropTarget ? 0.5 : 1),
                  mixBlendMode: (l.blend && l.blend !== "normal" ? l.blend : "normal") as React.CSSProperties["mixBlendMode"],
                  filter: filterString(l.adjust),
                  outline: l.id === selectedId && mode === "select" ? "2px solid #7ff0cd" : "none",
                  outlineOffset: 0,
                  cursor: l.locked ? "not-allowed" : mode === "select" ? "move" : "default",
                  pointerEvents: mode === "annotate" ? "none" : "auto",
                  overflow: "hidden",
                }}
              >
                {l.kind === "text" ? (
                  <div
                    className="select-none whitespace-pre-wrap break-words"
                    style={{
                      paddingTop: 8,
                      font: `${t.italic ? "italic " : ""}${t.bold ? "700" : "400"} ${t.fontSize}px ${t.fontFamily}`,
                      lineHeight: `${t.fontSize * t.lineHeight}px`,
                      color: t.color,
                      textAlign: t.align,
                      WebkitTextStroke: t.strokeWidth > 0 ? `${t.strokeWidth * 2}px ${t.strokeColor}` : undefined,
                      paintOrder: "stroke fill",
                    }}
                  >
                    {t.text}
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.src}
                    alt={l.name}
                    draggable={false}
                    className="pointer-events-none absolute select-none"
                    style={{
                      // crop: scale the whole source so the kept fraction fills the box
                      width: `${100 / c.w}%`,
                      height: `${100 / c.h}%`,
                      left: `${(-c.x / c.w) * 100}%`,
                      top: `${(-c.y / c.h) * 100}%`,
                      transform: `scale(${l.flipX ? -1 : 1}, ${l.flipY ? -1 : 1})`,
                      objectFit: "fill",
                      maxWidth: "none",
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* selection chrome: resize + rotate handles (drawn on top, in the layer's rotated frame) */}
          {selected && mode === "select" && !selected.locked && (
            <div className="pointer-events-none absolute" style={{ left: selected.x, top: selected.y, width: selected.width, height: selected.height, transform: `rotate(${selected.rotation}deg)` }}>
              {HANDLES.map((h) => (
                <div
                  key={h.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSnapshot();
                    const p = toCanvas(e.clientX, e.clientY);
                    setInteraction({ kind: "resize", id: selected.id, handle: h.id, start: { x: selected.x, y: selected.y, width: selected.width, height: selected.height }, startMouse: p, aspect: selected.width / selected.height });
                  }}
                  className="pointer-events-auto absolute rounded-sm border border-black bg-[#7ff0cd]"
                  style={{ ...h.style, width: 10 / zoom, height: 10 / zoom, marginLeft: -5 / zoom, marginTop: -5 / zoom, cursor: h.cursor }}
                />
              ))}
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSnapshot();
                  const p = toCanvas(e.clientX, e.clientY);
                  const cx = selected.x + selected.width / 2;
                  const cy = selected.y + selected.height / 2;
                  setInteraction({ kind: "rotate", id: selected.id, cx, cy, startAngle: (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI, startRotation: selected.rotation });
                }}
                title="拖曳旋轉（Shift = 每 15°）"
                className="pointer-events-auto absolute left-1/2 rounded-full border border-black bg-white"
                style={{ top: -28 / zoom, width: 12 / zoom, height: 12 / zoom, marginLeft: -6 / zoom, cursor: "grab" }}
              />
              <div className="absolute left-1/2 bg-white/60" style={{ top: -16 / zoom, width: 1 / zoom, height: 16 / zoom }} />
            </div>
          )}

          {/* smart guides */}
          {guides.map((g, i) =>
            g.axis === "x" ? (
              <div key={i} className="pointer-events-none absolute inset-y-0 bg-[#ff4fd8]" style={{ left: g.at, width: 1 / zoom }} />
            ) : (
              <div key={i} className="pointer-events-none absolute inset-x-0 bg-[#ff4fd8]" style={{ top: g.at, height: 1 / zoom }} />
            )
          )}

          {/* crop overlay */}
          {cropDraft && cropLayer && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-black/50" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${cropDraft.x}px ${cropDraft.y}px, ${cropDraft.x}px ${cropDraft.y + cropDraft.height}px, ${cropDraft.x + cropDraft.width}px ${cropDraft.y + cropDraft.height}px, ${cropDraft.x + cropDraft.width}px ${cropDraft.y}px, ${cropDraft.x}px ${cropDraft.y}px)` }} />
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const p = toCanvas(e.clientX, e.clientY);
                  setInteraction({ kind: "crop-move", offsetX: p.x - cropDraft.x, offsetY: p.y - cropDraft.y });
                }}
                className="absolute cursor-move outline outline-2 outline-[#f0c27f]"
                style={{ left: cropDraft.x, top: cropDraft.y, width: cropDraft.width, height: cropDraft.height, backgroundImage: "linear-gradient(#f0c27f44 1px, transparent 1px), linear-gradient(90deg, #f0c27f44 1px, transparent 1px)", backgroundSize: "33.33% 33.33%" }}
              >
                {HANDLES.map((h) => (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const p = toCanvas(e.clientX, e.clientY);
                      setInteraction({ kind: "crop-resize", handle: h.id, start: { ...cropDraft }, startMouse: p });
                    }}
                    className="absolute rounded-sm border border-black bg-[#f0c27f]"
                    style={{ ...h.style, width: 10 / zoom, height: 10 / zoom, marginLeft: -5 / zoom, marginTop: -5 / zoom, cursor: h.cursor }}
                  />
                ))}
              </div>
            </>
          )}

          {mode === "annotate" && (
            <canvas
              ref={annotateCanvasRef}
              width={canvas.width}
              height={canvas.height}
              className="absolute inset-0 cursor-crosshair"
              onPointerDown={(e) => {
                e.stopPropagation();
                annotateDrawing.current = true;
                annotateLast.current = null;
                const p = toCanvas(e.clientX, e.clientY);
                paintAnnotation(p.x, p.y);
              }}
              onPointerMove={(e) => {
                if (!annotateDrawing.current) return;
                const p = toCanvas(e.clientX, e.clientY);
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
    </div>
  );
}
