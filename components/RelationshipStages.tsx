"use client";

import { useId, useState } from "react";
import { AFFECTION_LEVELS, levelInfo } from "@/lib/relationshipStages";

function ProgressHeart({ percent, reached }: { percent: number; reached: boolean }) {
  const id = useId();
  const waterY = 21 - 16 * Math.max(0, Math.min(100, percent)) / 100;
  const path = "M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z";
  return <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0" aria-hidden="true">
    <defs><clipPath id={id}><path d={path} /></clipPath></defs>
    <path d={path} fill="#202930" stroke="#5e747d" strokeWidth="1.3" />
    {percent > 0 && <path d={percent >= 100 ? path : `M0 ${waterY} Q6 ${waterY - 1} 12 ${waterY} T24 ${waterY} V24 H0Z`} fill={reached ? "#f06b8b" : "#667078"} clipPath={`url(#${id})`} />}
    <path d={path} fill="none" stroke={reached ? "#b78999" : "#667078"} strokeWidth="1.2" />
  </svg>;
}

export default function RelationshipStages({ affection }: { affection: number }) {
  const actual = Number.isFinite(affection) ? Math.max(0, affection) : 0;
  const current = levelInfo(actual);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const selectedIndex = previewIndex ?? current.index;
  const selected = AFFECTION_LEVELS[selectedIndex];
  const locked = actual < selected.min;

  return <section aria-label="關係階段" className="space-y-4 p-4">
    <div className="rounded-xl border border-[#25473f] bg-[#11251f] p-3">
      <p className="text-xs text-[#93b9b0]">目前關係 · 好感度 {actual}</p>
      <h3 className="mt-1 text-base font-medium text-[#9af2da]">{current.name}</h3>
      <p className="mt-2 text-xs leading-5 text-[#a9bbb7]">{current.nextMin === null ? "已達最高關係階段，繼續累積彼此的故事。" : `距離下一階段還需要 ${Math.max(0, current.nextMin - actual)} 好感度。`}</p>
    </div>

    <div className="flex flex-col gap-2" role="group" aria-label="預覽各關係階段">
      {AFFECTION_LEVELS.map((stage, index) => {
        const percent = stage.min;
        const reached = actual >= stage.min;
        return <button type="button" key={stage.min} aria-pressed={selectedIndex === index}
          aria-label={`${stage.name}，門檻 ${stage.min}，${index === current.index ? "目前階段" : reached ? "已達成" : "尚未達成"}，進度 ${Math.round(percent)}%，點擊預覽`}
          onClick={() => setPreviewIndex(index)}
          className={`flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left transition-colors ${selectedIndex === index ? "border-[#72d9c2] bg-[#14332d]" : "border-[#293238] bg-[#141a1e] hover:border-[#61757d]"}`}>
          <ProgressHeart percent={percent} reached={reached} />
          <span className="min-w-0"><span className="block text-xs font-medium text-[#e0ebe8]">{stage.name}</span><span className="mt-1 block text-[10px] text-[#9caba7]">{stage.min} 好感度 · {index === current.index ? "目前" : reached ? "已達成" : "未解鎖"}</span></span>
        </button>;
      })}
    </div>

    <div className="rounded-xl border border-[#293238] bg-[#11181b] p-3" aria-live="polite">
      <p className="text-[11px] text-[#8da39b]">{selectedIndex === current.index ? "目前階段說明" : "階段預覽"}{locked ? ` · 尚需 ${selected.min - actual} 好感度` : ""}</p>
      <h4 className="mt-1 text-sm font-medium">{selected.name}</h4>
      <p className="mt-2 text-xs leading-6 text-[#acbbb6]">{selected.unlock}。</p>
      <p className="mt-2 text-[11px] leading-5 text-[#798f86]">點選僅預覽說明，不會改變好感度或解鎖階段。</p>
      {selectedIndex !== current.index && <button type="button" onClick={() => setPreviewIndex(null)} className="mt-2 text-xs text-[#8de5cc] hover:underline">返回目前階段</button>}
    </div>
  </section>;
}
