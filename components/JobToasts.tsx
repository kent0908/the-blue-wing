"use client";

import Link from "next/link";
import { IconImage, IconVideo, IconChat, IconClose, IconCheck } from "./Icons";
import { useGenerationJobs } from "@/lib/jobsStore";

const KIND_ICON = { image: IconImage, video: IconVideo, text: IconChat, audio: IconChat } as const;

/**
 * Floating toast stack, mounted once at the root layout so it shows up
 * regardless of which page you're on when a background generation finishes
 * (or fails) — see lib/jobsStore.tsx for why this had to move out of
 * app/studio/page.tsx.
 */
export default function JobToasts() {
  const { toasts, dismissToast } = useGenerationJobs();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[300px] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = KIND_ICON[t.mode] ?? IconImage;
        return (
          <Link
            key={t.id}
            href={`/studio?mode=${t.mode}`}
            onClick={() => dismissToast(t.id)}
            className={[
              "bw-menu pointer-events-auto flex items-start gap-2.5 rounded-xl p-3 shadow-2xl transition-transform hover:-translate-y-0.5",
              t.ok ? "" : "border-[#4a2020]",
            ].join(" ")}
          >
            <span
              className={[
                "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                t.ok ? "bg-[#10261f] text-[#7ff0cd]" : "bg-[#2a1616] text-[#ff8a8a]",
              ].join(" ")}
            >
              {t.ok ? <IconCheck className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-white">{t.title}</div>
              <div className="truncate text-[11.5px] text-[#9a9a9a]">{t.detail}</div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismissToast(t.id);
              }}
              aria-label="關閉"
              className="shrink-0 text-[#6d6d6d] transition-colors hover:text-white"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </Link>
        );
      })}
    </div>
  );
}
