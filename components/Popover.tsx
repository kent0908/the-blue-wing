"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Popover({
  trigger,
  children,
  align = "left",
  widthClass = "w-64",
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  widthClass?: string;
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
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="bw-chip">
        {trigger(open)}
      </button>
      {open && (
        <div
          className={`bw-menu absolute bottom-[calc(100%+8px)] z-40 p-1.5 ${widthClass} ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
