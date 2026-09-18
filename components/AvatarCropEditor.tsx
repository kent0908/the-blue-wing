"use client";
import { useRef } from "react";
import type { AvatarCrop } from "@/lib/characterProfile";
export const DEFAULT_CROP: AvatarCrop = { x: 0, y: 0, zoom: 1 };
export function CroppedAvatar({ src, crop, className = "" }: { src: string; crop: AvatarCrop; className?: string }) {
  return <span className={`relative block overflow-hidden bg-[#171b19] ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated source; crop changes display only */}
    <img src={src} alt="角色頭像" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full max-w-none object-contain" style={{ transform: `translate(${crop.x}%, ${crop.y}%) scale(${crop.zoom})` }} />
  </span>;
}
export default function AvatarCropEditor({ src, value, onChange }: { src: string; value?: AvatarCrop; onChange: (crop: AvatarCrop) => void }) {
  const crop = value ?? DEFAULT_CROP;
  const drag = useRef<{ x: number; y: number; crop: AvatarCrop; size: number } | null>(null);
  const clamp = (v: number) => Math.max(-300, Math.min(300, v));
  return <section className="mt-4 space-y-4 rounded-xl border border-white/15 p-4" aria-label="頭像裁切">
    <div><h3 className="text-sm">調整頭像取景</h3><p className="mt-1 text-xs leading-6 text-white/50">拖曳圖片對準臉部，再調整縮放。只改變頭像顯示，不會裁掉生成用的原始素材。</p></div>
    <div className="flex flex-wrap items-center gap-5">
      <div className="h-48 w-48 touch-none cursor-move overflow-hidden rounded-full ring-1 ring-[#7ff0cd]/60" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, crop, size: e.currentTarget.clientWidth }; }} onPointerMove={e => { const d = drag.current; if (d) onChange({ ...d.crop, x: clamp(d.crop.x + (e.clientX - d.x) / d.size * 100), y: clamp(d.crop.y + (e.clientY - d.y) / d.size * 100) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <CroppedAvatar src={src} crop={crop} className="h-full w-full rounded-full" />
      </div>
      <div className="space-y-2"><p className="text-xs text-white/50">實際大小預覽</p><CroppedAvatar src={src} crop={crop} className="h-11 w-11 rounded-full" /></div>
    </div>
    {([['zoom', '縮放', 1, 8, 0.1], ['x', '水平位置', -300, 300, 1], ['y', '垂直位置', -300, 300, 1]] as const).map(([key, label, min, max, step]) => <label key={key} className="block text-xs text-white/70">{label}<input className="mt-2 block w-full accent-[#7ff0cd]" aria-label={label} type="range" min={min} max={max} step={step} value={crop[key]} onChange={e => onChange({ ...crop, [key]: Number(e.target.value) })} /></label>)}
    <button type="button" className="text-xs text-[#7ff0cd]" onClick={() => onChange(DEFAULT_CROP)}>重設取景</button>
  </section>;
}
