"use client";

import { useEffect, useRef, useState } from "react";
import { IconSearch, IconChevronDown, IconCollapse, IconCheck } from "./Icons";
import type { ResultItem } from "@/lib/types";

type KindFilter = "all" | "image" | "video" | "text";
type TimeFilter = "all" | "today" | "7d" | "30d";

const KIND_LABEL: Record<KindFilter, string> = { all: "全部類型", image: "圖片", video: "影片", text: "文字" };
const TIME_LABEL: Record<TimeFilter, string> = { all: "全部時間", today: "今天", "7d": "近 7 天", "30d": "近 30 天" };

/** Small downward-opening dropdown — Popover.tsx opens upward (built for the
 *  bottom-anchored Composer), which would run off-screen from this panel's
 *  top filter row. */
function FilterDropdown<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex h-9 items-center gap-1 rounded-full px-3 text-[13px] transition-colors",
          value === "all" ? "bg-[#1a1a1a] text-[#c9c9c9] hover:bg-[#222]" : "bg-[#1f1f1f] text-white ring-1 ring-[#3a3a3a]",
        ].join(" ")}
      >
        {labels[value]}
        <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="bw-menu absolute right-0 top-[calc(100%+6px)] z-40 w-[150px] p-1.5">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className="bw-menu-item"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              <span className="flex-1">{labels[opt]}</span>
              {opt === value && <IconCheck className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InspirationPanel({
  history,
  onClose,
}: {
  history: ResultItem[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"inspiration" | "history">("history");
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  // "now" only needs to exist as of the moment the filter was picked, so it's
  // captured in this event handler (not read directly during render, which
  // Date.now() isn't allowed to be — https://react.dev/reference/rules/components-and-hooks-must-be-pure).
  const [timeCutoff, setTimeCutoff] = useState(0);

  const applyTimeFilter = (tf: TimeFilter) => {
    setTimeFilter(tf);
    if (tf === "all") {
      setTimeCutoff(0);
      return;
    }
    const now = Date.now();
    if (tf === "today") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      setTimeCutoff(d.getTime());
    } else if (tf === "7d") {
      setTimeCutoff(now - 7 * 86_400_000);
    } else {
      setTimeCutoff(now - 30 * 86_400_000); // 30d
    }
  };

  const filtered = history.filter((h) => {
    if (kindFilter !== "all" && h.kind !== kindFilter) return false;
    if (h.createdAt < timeCutoff) return false;
    return h.prompt.toLowerCase().includes(q.toLowerCase());
  });

  const filtersActive = kindFilter !== "all" || timeFilter !== "all" || q.trim().length > 0;

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

      {tab === "history" && (
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
          <FilterDropdown value={timeFilter} options={["all", "today", "7d", "30d"]} labels={TIME_LABEL} onChange={applyTimeFilter} />
          <FilterDropdown value={kindFilter} options={["all", "image", "video", "text"]} labels={KIND_LABEL} onChange={setKindFilter} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {tab === "history" && filtered.length === 0 && (
          <div className="pt-16 text-center text-[13px] text-[#5c5c5c]">
            {filtersActive ? (
              "沒有符合篩選條件的紀錄"
            ) : (
              <>
                還沒有生成紀錄
                <br />
                送出第一個 prompt 就會出現在這裡
              </>
            )}
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
