"use client";

import { useEffect, useState } from "react";

const STAGES = ["送出請求", "路由到供應商", "模型生成中", "取回結果"];

/**
 * Indeterminate progress card shown while a generation job is running.
 * The bar eases toward 92% and only completes when the job actually resolves,
 * so it never claims to be done before the API says so.
 */
export default function GenerationProgress({
  label,
  startedAt,
  stageIndex,
}: {
  label: string;
  startedAt: number;
  stageIndex: number;
}) {
  const [pct, setPct] = useState(4);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPct((p) => (p >= 92 ? 92 : p + Math.max(0.3, (92 - p) * 0.035)));
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 220);
    return () => clearInterval(t);
  }, [startedAt]);

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-[#262626] bg-[#141414] p-6">
      <div className="flex items-center gap-4">
        <span className="relative grid h-10 w-10 place-items-center">
          <span className="absolute inset-0 rounded-full border border-[#7ff0cd]/50 bw-pulse-ring" />
          <span className="h-6 w-6 rounded-full border-2 border-[#2c2c2c] border-t-[#7ff0cd] bw-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px]">{label}</div>
          <div className="text-[12px] text-[#7d7d7d]">
            {STAGES[Math.min(stageIndex, STAGES.length - 1)]} · 已耗時 {elapsed}s
          </div>
        </div>
      </div>

      <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-[#242424]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between text-[11.5px] text-[#5c5c5c]">
        {STAGES.map((s, i) => (
          <span key={s} className={i <= stageIndex ? "text-[#a8a8a8]" : ""}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
