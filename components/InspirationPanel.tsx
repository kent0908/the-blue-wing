"use client";

import { useState } from "react";
import { IconSearch, IconChevronDown, IconCollapse } from "./Icons";
import type { ResultItem } from "@/lib/types";

export default function InspirationPanel({
  history,
  onClose,
}: {
  history: ResultItem[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"inspiration" | "history">("history");
  const [q, setQ] = useState("");

  const filtered = history.filter((h) => h.prompt.toLowerCase().includes(q.toLowerCase()));

  return (
    <aside className="flex w-[390px] shrink-0 flex-col border-l border-[#1c1c1c] bg-black">
      <div className="flex items-center gap-1 px-4 py-3">
        <button
          onClick={() => setTab("inspiration")}
          className={[
            "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
            tab === "inspiration" ? "bg-[#1f1f1f] text-white" : "text-[#8a8a8a] hover:text-white",
          ].join(" ")}
        >
          靈感廣場
        </button>
        <button
          onClick={() => setTab("history")}
          className={[
            "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
            tab === "history" ? "bg-[#1f1f1f] text-white" : "text-[#8a8a8a] hover:text-white",
          ].join(" ")}
        >
          生成紀錄
        </button>
        <button
          onClick={onClose}
          aria-label="收起面板"
          className="ml-auto rounded-lg p-1.5 text-[#8a8a8a] transition-colors hover:text-white"
        >
          <IconCollapse className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-[#1a1a1a] px-3.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋 Prompt 關鍵字"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-[#6d6d6d] focus:outline-none"
          />
          <IconSearch className="h-4 w-4 shrink-0 text-[#6d6d6d]" />
        </div>
        <button className="flex h-9 items-center gap-1 rounded-full bg-[#1a1a1a] px-3 text-[13px] text-[#c9c9c9]">
          時間 <IconChevronDown className="h-3.5 w-3.5" />
        </button>
        <button className="flex h-9 items-center gap-1 rounded-full bg-[#1a1a1a] px-3 text-[13px] text-[#c9c9c9]">
          類型 <IconChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {tab === "history" && filtered.length === 0 && (
          <div className="pt-16 text-center text-[13px] text-[#5c5c5c]">
            還沒有生成紀錄
            <br />
            送出第一個 prompt 就會出現在這裡
          </div>
        )}

        {tab === "inspiration" && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="bw-shimmer rounded-lg"
                style={{ height: i % 3 === 0 ? 190 : 130 }}
              />
            ))}
          </div>
        )}

        {tab === "history" && filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((h) => (
              <div key={h.id} className="overflow-hidden rounded-lg bg-[#141414]">
                {h.kind === "image" && h.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.url} alt={h.prompt} className="w-full object-cover" />
                )}
                {h.kind === "video" && h.url && (
                  <video src={h.url} className="w-full" controls preload="metadata" />
                )}
                {h.kind === "text" && (
                  <div className="line-clamp-6 p-3 text-[12px] leading-relaxed text-[#c9c9c9]">{h.text}</div>
                )}
                <div className="truncate px-2.5 py-2 text-[11px] text-[#7d7d7d]">{h.prompt}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
