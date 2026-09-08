"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export default function Popover({
  trigger,
  label,
  children,
  align = "left",
  widthClass = "w-64",
}: {
  label?: string;
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const panel = panelRef.current;
      if (!panel) return;
      panel.style.transform = "";
      const rect = panel.getBoundingClientRect();
      const shift = rect.left < 12 ? 12 - rect.left : rect.right > window.innerWidth - 12 ? window.innerWidth - 12 - rect.right : 0;
      panel.style.transform = `translateX(${shift}px)`;
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);

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
      <button aria-label={label} aria-expanded={open} type="button" onClick={() => setOpen((v) => !v)} className="bw-chip">
        {trigger(open)}
      </button>
      {open && (
        <div ref={panelRef}
          // max-width is a safety net for any chip near a screen edge — the
          // per-instance `align` should already keep the panel on-screen,
          // but this stops it from ever being wider than the viewport itself
          // (e.g. a narrow app window) regardless of which edge it grows from.
          style={{ maxWidth: "calc(100vw - 24px)" }}
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
