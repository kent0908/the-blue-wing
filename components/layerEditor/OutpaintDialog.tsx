"use client";

import { useState } from "react";
import { IconClose } from "../Icons";
import type { EditorLayer, OutpaintMargins } from "@/lib/layerEditor";

const PRESETS: { label: string; margins: OutpaintMargins }[] = [
  { label: "四周 25%", margins: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 } },
  { label: "四周 50%", margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } },
  { label: "左右 50%（變橫）", margins: { top: 0, right: 0.5, bottom: 0, left: 0.5 } },
  { label: "上下 50%（變直）", margins: { top: 0.5, right: 0, bottom: 0.5, left: 0 } },
  { label: "只往下", margins: { top: 0, right: 0, bottom: 0.6, left: 0 } },
  { label: "只往上", margins: { top: 0.6, right: 0, bottom: 0, left: 0 } },
];

const DEFAULT_PROMPT = "Extend the picture outward: continue the background and surroundings naturally beyond the original edges, matching the existing style, lighting and colors. Keep the original center unchanged.";

/**
 * 擴圖 (outpainting) setup: how far to extend on each side (fractions of
 * the layer's own size) and what should appear there. The actual request
 * is built by lib/layerEditor's buildOutpaintRequest and sent through the
 * same /api/images/edit route as 局部重繪 — verified live 2026-09-12.
 */
export default function OutpaintDialog({
  layer,
  onCancel,
  onSubmit,
  submitting,
  errorMessage,
}: {
  layer: EditorLayer;
  onCancel: () => void;
  onSubmit: (margins: OutpaintMargins, prompt: string) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const [margins, setMargins] = useState<OutpaintMargins>(PRESETS[0].margins);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const fullW = 1 + margins.left + margins.right;
  const fullH = 1 + margins.top + margins.bottom;
  // preview box: fit the extended rect in 320x320
  const s = 320 / Math.max(fullW * layer.width, fullH * layer.height);
  const pw = fullW * layer.width * s;
  const ph = fullH * layer.height * s;
  const side = (k: keyof OutpaintMargins, label: string) => (
    <label key={k} className="block text-[10px] text-[#8a8a8a]">
      {label} <span className="text-[#c9c9c9]">{Math.round(margins[k] * 100)}%</span>
      <input type="range" min={0} max={100} value={Math.round(margins[k] * 100)} onChange={(e) => setMargins({ ...margins, [k]: Number(e.target.value) / 100 })} className="w-full accent-[#7ff0cd]" />
    </label>
  );
  const any = margins.top + margins.right + margins.bottom + margins.left > 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4">
      <div className="flex w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#111]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1c] px-4">
          <span className="text-[13px] font-medium text-white">擴圖</span>
          <span className="text-[11px] text-[#6d6d6d]">把畫面往外延伸，AI 補上原本邊界外的內容</span>
          <button type="button" onClick={onCancel} aria-label="關閉" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-5 p-4">
          <div className="flex w-[340px] shrink-0 flex-col items-center justify-center">
            <div className="relative rounded-lg border border-dashed border-[#7ff0cd66] bg-[#0a0a0a]" style={{ width: pw, height: ph }}>
              <div className="absolute overflow-hidden" style={{ left: margins.left * layer.width * s, top: margins.top * layer.height * s, width: layer.width * s, height: layer.height * s }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={layer.src} alt="" className="h-full w-full object-fill" style={{ transform: `scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})` }} />
              </div>
              <span className="pointer-events-none absolute -bottom-5 left-0 text-[10px] text-[#6d6d6d]">虛線框＝擴圖後的範圍</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="mb-1 text-[10.5px] text-[#8a8a8a]">快速選擇</div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => setMargins(p.margins)} className="rounded-md bg-[#1f1f1f] px-2 py-1 text-[11px] text-[#c9c9c9] hover:bg-[#282828]">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              {side("top", "上")}
              {side("bottom", "下")}
              {side("left", "左")}
              {side("right", "右")}
            </div>
            <label className="block">
              <div className="mb-1 text-[10.5px] text-[#8a8a8a]">延伸出去的內容（可改）</div>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] text-white focus:border-[#4a4a4a] focus:outline-none" />
            </label>
            {errorMessage && <p className="text-[11.5px] text-[#ff9b9b]">{errorMessage}</p>}
            <button
              type="button"
              disabled={submitting || !any || !prompt.trim()}
              onClick={() => onSubmit(margins, prompt.trim())}
              className="w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-2 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50"
            >
              {submitting ? "擴圖中…" : "開始擴圖"}
            </button>
            <p className="text-[10px] leading-relaxed text-[#6d6d6d]">
              固定使用 Seedream 5.0 pro（和局部重繪同一個編輯端點，計一次點數）。結果會取代這個圖層並自動放大成延伸後的大小，原本的畫面保留在中間；可以用「比對」檢查、「回復」還原。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
