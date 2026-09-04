"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconImage, IconVideo, IconChat, IconClose } from "./Icons";
import type { PendingJob } from "@/lib/types";

const KIND_ICON = { image: IconImage, video: IconVideo, text: IconChat } as const;
const STAGE_LABEL = ["送出請求", "路由到供應商", "模型生成中", "取回結果"];

function Elapsed({ startedAt }: { startedAt: number }) {
  const [s, setS] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    const t = setInterval(() => setS(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return <>{s}s</>;
}

/**
 * Horizontal strip of in-flight generations, shown above the composer.
 * Several jobs can run at once (see PendingJob doc comment) — this replaced
 * the old single full-screen "generating…" takeover, which made it look like
 * only one generation could happen at a time even though the API never
 * actually required that.
 */
export default function JobQueue({ jobs, onDismiss }: { jobs: PendingJob[]; onDismiss: (id: string) => void }) {
  if (!jobs.length) return null;

  return (
    <div className="mx-auto mb-2 flex w-full max-w-[840px] gap-2 overflow-x-auto pb-1">
      {jobs.map((j) => {
        const Icon = KIND_ICON[j.kind];
        return (
          <div
            key={j.id}
            className={[
              "flex w-[230px] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5",
              j.error ? "border-[#4a2020] bg-[#1a1010]" : "border-[#2a2a2a] bg-[#141414]",
            ].join(" ")}
          >
            {j.error ? (
              <>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#2a1616] text-[13px] text-[#ff8a8a]">!</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] text-[#ff9b9b]" title={j.error}>
                    {j.error}
                  </div>
                  {j.errorCta && (
                    <Link href={j.errorCta.href} className="text-[10.5px] text-[#7ff0cd] hover:underline">
                      {j.errorCta.label}
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="relative grid h-7 w-7 shrink-0 place-items-center">
                  <span className="absolute inset-0 rounded-full border border-[#7ff0cd]/50 bw-pulse-ring" />
                  <Icon className="h-3.5 w-3.5 text-[#7ff0cd]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] text-white">{j.prompt || j.model}</div>
                  <div className="truncate text-[10.5px] text-[#7d7d7d]">
                    {STAGE_LABEL[Math.min(j.stage, STAGE_LABEL.length - 1)]} · <Elapsed startedAt={j.startedAt} />
                  </div>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => onDismiss(j.id)}
              aria-label={j.error ? "關閉" : "從清單隱藏（不會取消生成）"}
              title={j.error ? "關閉" : "從清單隱藏（不會取消生成）"}
              className="shrink-0 text-[#6d6d6d] transition-colors hover:text-white"
            >
              <IconClose className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
