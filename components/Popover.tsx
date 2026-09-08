"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export default function Popover({
  trigger,
  label,
  children,
  align = "left",
  widthClass = "w-64",
  triggerClassName = "",
}: {
  label?: string;
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  widthClass?: string;
  triggerClassName?: string;
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
      panel.style.left = "";
      panel.style.right = "";
      const rect = panel.getBoundingClientRect();
      // Mobile innerWidth can expand to include an overflowing absolute popup,
      // creating a feedback loop. The root client width stays viewport-sized.
      const viewportWidth = document.documentElement.clientWidth;
      const shift = rect.left < 12 ? 12 - rect.left : rect.right > viewportWidth - 12 ? viewportWidth - 12 - rect.right : 0;
      // Change layout position instead of translating: transforms can leave
      // the unshifted box contributing to mobile horizontal scroll overflow.
      if (align === "right") panel.style.right = `${-shift}px`;
      else panel.style.left = `${shift}px`;
    };
    let frame = 0;
    const schedulePosition = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(position); };
    position();
    schedulePosition();
    // Responsive menu content and chip wrapping can reflow after the window's
    // resize event. Observe final element sizes instead of measuring only then.
    const observer = new ResizeObserver(schedulePosition);
    if (panelRef.current) observer.observe(panelRef.current);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", schedulePosition);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedulePosition); window.visualViewport?.removeEventListener("resize", schedulePosition); };
  }, [open, align]);

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
      <button aria-label={label} aria-expanded={open} type="button" onClick={() => setOpen((v) => !v)} className={`bw-chip ${triggerClassName}`}>
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
