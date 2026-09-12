"use client";

import { useState } from "react";
import { IconClose } from "../Icons";

/**
 * Before/after wipe for a layer whose pixels an AI step just replaced
 * (局部重繪 / 擴圖 / 去背): drag the divider, or switch to side-by-side.
 * `onRevert` puts the previous source back (the parent keeps it as
 * layer.previousSrc).
 */
export default function CompareModal({ before, after, onClose, onRevert }: { before: string; after: string; onClose: () => void; onRevert: () => void }) {
  const [split, setSplit] = useState(50);
  const [mode, setMode] = useState<"wipe" | "side">("wipe");
  const checker = { backgroundImage: "linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0" };

  return (
    <div className="fixed inset-0 z-[210] flex flex-col bg-black/95">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1c] px-4">
        <span className="text-[13px] font-medium text-white">前後比對</span>
        <div className="ml-3 flex gap-1">
          {(["wipe", "side"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-2 py-1 text-[11px] ${mode === m ? "bg-[#233a34] text-[#7ff0cd]" : "bg-[#1f1f1f] text-[#c9c9c9]"}`}>
              {m === "wipe" ? "拖曳比對" : "並排"}
            </button>
          ))}
        </div>
        <button type="button" onClick={onRevert} className="ml-auto rounded-lg bg-[#2a1414] px-3 py-1.5 text-[12px] text-[#ff9b9b] hover:bg-[#331818]">
          回復成修改前
        </button>
        <button type="button" onClick={onClose} className="rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-1.5 text-[12px] font-medium text-[#0a1a16]">
          保留新結果
        </button>
        <button type="button" onClick={onClose} aria-label="關閉" className="grid h-8 w-8 place-items-center rounded-full text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-white">
          <IconClose className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-4 p-6">
        {mode === "side" ? (
          <>
            <figure className="flex min-h-0 max-w-[48%] flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={before} alt="修改前" className="max-h-[80vh] max-w-full rounded-lg object-contain" style={checker} />
              <figcaption className="text-[11px] text-[#8a8a8a]">修改前</figcaption>
            </figure>
            <figure className="flex min-h-0 max-w-[48%] flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={after} alt="修改後" className="max-h-[80vh] max-w-full rounded-lg object-contain" style={checker} />
              <figcaption className="text-[11px] text-[#7ff0cd]">修改後</figcaption>
            </figure>
          </>
        ) : (
          <div className="relative max-h-[82vh] max-w-full select-none overflow-hidden rounded-lg" style={checker}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={after} alt="修改後" className="block max-h-[82vh] max-w-full" draggable={false} />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${split}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={before} alt="修改前" className="block max-h-[82vh] max-w-none" draggable={false} style={{ width: `${10000 / split}%` }} />
            </div>
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#7ff0cd]" style={{ left: `${split}%` }} />
            <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">修改前</span>
            <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-[#7ff0cd]">修改後</span>
            <input type="range" min={1} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="absolute inset-x-0 bottom-3 mx-auto w-[60%] accent-[#7ff0cd]" aria-label="比對分割位置" />
          </div>
        )}
      </div>
    </div>
  );
}
