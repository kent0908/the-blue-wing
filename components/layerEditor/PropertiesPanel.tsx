"use client";

import { BLEND_MODES, DEFAULT_ADJUST, DEFAULT_TEXT_STYLE, TEXT_FONTS, alignLayer, fitToCanvas, type AlignTarget, type CanvasSpec, type EditorLayer, type LayerAdjust, type TextStyle } from "@/lib/layerEditor";

export type LayerAction = "duplicate" | "delete" | "crop" | "redraw" | "outpaint" | "removeBg" | "compare" | "revert" | "front" | "back";

const fieldCls = "w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2 py-1 text-[11.5px] text-white focus:border-[#4a4a4a] focus:outline-none";
const btnCls = "rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[11px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40";

function Slider({ label, value, min, max, step = 1, unit = "", onChange, onStart }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; onStart: () => void }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-[10px] text-[#8a8a8a]">
        <span>{label}</span>
        <span className="text-[#c9c9c9]">
          {value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onPointerDown={onStart} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#7ff0cd]" />
    </label>
  );
}

const ADJUSTS: { key: keyof LayerAdjust; label: string; min: number; max: number; unit: string }[] = [
  { key: "brightness", label: "亮度", min: 0, max: 200, unit: "%" },
  { key: "contrast", label: "對比", min: 0, max: 200, unit: "%" },
  { key: "saturate", label: "飽和度", min: 0, max: 300, unit: "%" },
  { key: "hue", label: "色相", min: -180, max: 180, unit: "°" },
  { key: "blur", label: "模糊", min: 0, max: 40, unit: "px" },
  { key: "grayscale", label: "去色", min: 0, max: 100, unit: "%" },
  { key: "sepia", label: "懷舊", min: 0, max: 100, unit: "%" },
];

/**
 * Right-hand panel for the selected layer: transform, opacity / blend,
 * flip, alignment, colour adjustments, text style, and the per-layer AI +
 * pixel actions. Every edit goes through `onPatch(patch, snapshot)` —
 * `snapshot` = true pushes an undo step first (discrete changes); sliders
 * call `onSnapshot` once at drag start instead so undo steps back a whole
 * gesture.
 */
export default function PropertiesPanel({
  layer,
  canvas,
  busy,
  onPatch,
  onSnapshot,
  onAction,
}: {
  layer: EditorLayer;
  canvas: CanvasSpec;
  busy: string | null;
  onPatch: (patch: Partial<EditorLayer>, snapshot?: boolean) => void;
  onSnapshot: () => void;
  onAction: (action: LayerAction) => void;
}) {
  const adjust = layer.adjust ?? DEFAULT_ADJUST;
  const setAdjust = (key: keyof LayerAdjust, v: number) => onPatch({ adjust: { ...adjust, [key]: v } });
  const text = layer.text ?? DEFAULT_TEXT_STYLE;
  const setText = (patch: Partial<TextStyle>, snapshot = true) => onPatch({ text: { ...text, ...patch }, ...(patch.text !== undefined ? { name: patch.text.slice(0, 20) || "文字" } : {}) }, snapshot);
  const num = (key: "x" | "y" | "width" | "height") => (
    <label key={key} className="text-[10px] text-[#8a8a8a]">
      {{ x: "X", y: "Y", width: "寬", height: "高" }[key]}
      <input
        type="number"
        value={Math.round(layer[key])}
        onFocus={onSnapshot}
        onChange={(e) => onPatch({ [key]: key === "width" || key === "height" ? Math.max(4, Number(e.target.value)) : Number(e.target.value) })}
        className={fieldCls}
      />
    </label>
  );
  const align = (t: AlignTarget, glyph: string, title: string) => (
    <button key={t} type="button" title={title} onClick={() => onPatch(alignLayer(layer, canvas, t), true)} className={btnCls}>
      {glyph}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 truncate text-[11px] text-[#8a8a8a]">
          {layer.kind === "text" ? "文字圖層" : "圖層"}：<span className="text-white">{layer.name}</span>
        </div>
        {layer.locked && <span className="text-[10px] text-[#f0c27f]">🔒 已鎖定</span>}
      </div>

      {layer.kind === "text" && (
        <div className="space-y-2 rounded-lg bg-[#161616] p-2">
          <textarea value={text.text} onChange={(e) => setText({ text: e.target.value }, false)} onFocus={onSnapshot} rows={3} className={`${fieldCls} resize-none`} placeholder="輸入文字" />
          <div className="grid grid-cols-2 gap-1.5">
            <select value={text.fontFamily} onChange={(e) => setText({ fontFamily: e.target.value })} className={fieldCls}>
              {TEXT_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <input type="number" min={8} max={400} value={text.fontSize} onFocus={onSnapshot} onChange={(e) => setText({ fontSize: Math.max(8, Number(e.target.value)) }, false)} className={fieldCls} title="字級" />
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setText({ bold: !text.bold })} className={`${btnCls} font-bold ${text.bold ? "text-[#7ff0cd]" : ""}`}>B</button>
            <button type="button" onClick={() => setText({ italic: !text.italic })} className={`${btnCls} italic ${text.italic ? "text-[#7ff0cd]" : ""}`}>I</button>
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} type="button" onClick={() => setText({ align: a })} className={`${btnCls} ${text.align === a ? "text-[#7ff0cd]" : ""}`}>
                {a === "left" ? "⇤" : a === "center" ? "☰" : "⇥"}
              </button>
            ))}
            <input type="color" value={text.color} onChange={(e) => setText({ color: e.target.value }, false)} onFocus={onSnapshot} className="h-7 w-9 cursor-pointer rounded border border-[#2c2c2c] bg-[#1c1c1c]" title="文字顏色" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#8a8a8a]">描邊</span>
            <input type="range" min={0} max={20} value={text.strokeWidth} onPointerDown={onSnapshot} onChange={(e) => setText({ strokeWidth: Number(e.target.value) }, false)} className="min-w-0 flex-1 accent-[#7ff0cd]" />
            <input type="color" value={text.strokeColor} onChange={(e) => setText({ strokeColor: e.target.value }, false)} onFocus={onSnapshot} className="h-7 w-9 cursor-pointer rounded border border-[#2c2c2c] bg-[#1c1c1c]" title="描邊顏色" />
          </div>
          <Slider label="行高" value={Math.round(text.lineHeight * 100)} min={80} max={250} unit="%" onStart={onSnapshot} onChange={(v) => setText({ lineHeight: v / 100 }, false)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">{(["x", "y", "width", "height"] as const).map(num)}</div>
      <Slider label="旋轉" value={Math.round(layer.rotation)} min={-180} max={180} unit="°" onStart={onSnapshot} onChange={(v) => onPatch({ rotation: v })} />
      <Slider label="不透明度" value={Math.round((layer.opacity ?? 1) * 100)} min={0} max={100} unit="%" onStart={onSnapshot} onChange={(v) => onPatch({ opacity: v / 100 })} />
      <label className="block text-[10px] text-[#8a8a8a]">
        混合模式
        <select value={layer.blend ?? "normal"} onChange={(e) => onPatch({ blend: e.target.value as EditorLayer["blend"] }, true)} className={fieldCls}>
          {BLEND_MODES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="mb-1 text-[10px] text-[#8a8a8a]">對齊畫布</div>
        <div className="grid grid-cols-6 gap-1">
          {align("left", "⇤", "靠左")}
          {align("centerX", "↔", "水平置中")}
          {align("right", "⇥", "靠右")}
          {align("top", "⤒", "靠上")}
          {align("centerY", "↕", "垂直置中")}
          {align("bottom", "⤓", "靠下")}
        </div>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {layer.kind === "image" && (
            <>
              <button type="button" onClick={() => onPatch({ flipX: !layer.flipX }, true)} className={`${btnCls} ${layer.flipX ? "text-[#7ff0cd]" : ""}`} title="水平翻轉">⇋</button>
              <button type="button" onClick={() => onPatch({ flipY: !layer.flipY }, true)} className={`${btnCls} ${layer.flipY ? "text-[#7ff0cd]" : ""}`} title="垂直翻轉">⇅</button>
            </>
          )}
          <button type="button" onClick={() => onPatch(fitToCanvas(layer, canvas, "contain"), true)} className={btnCls} title="縮放到剛好放進畫布">適合</button>
          <button type="button" onClick={() => onPatch(fitToCanvas(layer, canvas, "cover"), true)} className={btnCls} title="縮放到填滿畫布">填滿</button>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <button type="button" onClick={() => onAction("front")} className={btnCls}>移到最前</button>
          <button type="button" onClick={() => onAction("back")} className={btnCls}>移到最後</button>
        </div>
      </div>

      {layer.kind === "image" && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-[#8a8a8a]">
            <span>色彩校正（非破壞，隨時可重設）</span>
            {layer.adjust && (
              <button type="button" onClick={() => onPatch({ adjust: undefined }, true)} className="text-[#7ff0cd] hover:underline">
                重設
              </button>
            )}
          </div>
          <div className="space-y-1.5 rounded-lg bg-[#161616] p-2">
            {ADJUSTS.map((a) => (
              <Slider key={a.key} label={a.label} value={adjust[a.key]} min={a.min} max={a.max} unit={a.unit} onStart={onSnapshot} onChange={(v) => setAdjust(a.key, v)} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => onAction("duplicate")} className={btnCls}>⧉ 複製圖層</button>
        <button type="button" onClick={() => onAction("delete")} className={`${btnCls} hover:bg-[#2a1414] hover:text-[#ff9b9b]`}>刪除圖層</button>
      </div>

      {layer.kind === "image" && (
        <div className="space-y-1.5 border-t border-[#1e1e1e] pt-3">
          <div className="text-[10px] text-[#8a8a8a]">修圖</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={!!busy} onClick={() => onAction("crop")} className={btnCls} title="拖出要保留的範圍">✂ 裁切</button>
            <button type="button" disabled={!!busy} onClick={() => onAction("removeBg")} className={btnCls} title="瀏覽器端 AI 去背，免點數">
              {busy === "removeBg" ? "去背中…" : "✦ 一鍵去背"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => onAction("redraw")} className={btnCls} title="塗抹區域讓 AI 重畫">🖌 局部重繪</button>
            <button type="button" disabled={!!busy} onClick={() => onAction("outpaint")} className={btnCls} title="往外延伸畫面">⤢ 擴圖</button>
          </div>
          {layer.previousSrc && (
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => onAction("compare")} className={`${btnCls} text-[#7ff0cd]`}>前後比對</button>
              <button type="button" onClick={() => onAction("revert")} className={btnCls}>回復修改前</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
