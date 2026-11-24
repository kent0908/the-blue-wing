"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const anchor = ref.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
      const above = Math.max(0, anchor.top - viewportTop - 20);
      const below = Math.max(0, viewportBottom - anchor.bottom - 20);
      const openAbove = above >= Math.min(panel.scrollHeight, 360) || above > below;
      panel.style.maxHeight = `${openAbove ? above : below}px`;
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(align === "right" ? anchor.right - rect.width : anchor.left, viewportWidth - rect.width - 12))}px`;
      panel.style.top = `${openAbove ? anchor.top - rect.height - 8 : anchor.bottom + 8}px`;
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
    window.addEventListener("scroll", schedulePosition, true);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedulePosition); window.removeEventListener("scroll", schedulePosition, true); window.visualViewport?.removeEventListener("resize", schedulePosition); };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false);
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
      <button aria-label={label} aria-expanded={open} type="button" onClick={event => { setPortalHost(event.currentTarget.closest("dialog") ?? document.body); setOpen(v => !v); }} className={`bw-chip ${triggerClassName}`}>
        {trigger(open)}
      </button>
      {open && portalHost && createPortal(
        <div ref={panelRef}
          // max-width is a safety net for any chip near a screen edge — the
          // per-instance `align` should already keep the panel on-screen,
          // but this stops it from ever being wider than the viewport itself
          // (e.g. a narrow app window) regardless of which edge it grows from.
          style={{ maxWidth: "calc(100vw - 24px)" }}
          className={`bw-menu fixed z-50 overflow-y-auto overscroll-contain p-1.5 ${widthClass}`}
        >
          {children(() => setOpen(false))}
        </div>, portalHost
      )}
    </div>
  );
}
