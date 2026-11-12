"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { setLocaleCookie, useLocale, useT } from "@/lib/i18n/client";
import { LOCALES, LOCALE_LABEL, LOCALE_TAG, type Locale } from "@/lib/i18n/locale";
import { IconGlobe } from "./Icons";

export default function LanguageMenu() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(next: Locale) {
    close();
    if (next === locale) return;
    setLocaleCookie(next);
    router.refresh();
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const current = items.findIndex(item => item === document.activeElement);
    if (current < 0 || !items.length) return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + direction + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div ref={root} className="relative shrink-0" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} type="button" onClick={() => setOpen(value => !value)} aria-haspopup="menu" aria-expanded={open} aria-label={t.top.switchLanguage} title={t.top.switchLanguage}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13.5px] text-[#d4d4d4] transition-colors hover:text-white sm:px-2.5">
        <IconGlobe className="h-[17px] w-[17px]" />
        <span lang={LOCALE_TAG[locale]} className="hidden whitespace-nowrap text-[12.5px] md:inline">{LOCALE_LABEL[locale]}</span>
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={t.top.language} onKeyDown={handleKeys} className="bw-menu absolute right-0 top-full z-50 mt-1 w-[150px] p-1.5">
          {LOCALES.map(option => (
            <button key={option} lang={LOCALE_TAG[option]} role="menuitemradio" aria-checked={option === locale} type="button" onClick={() => choose(option)} className="bw-menu-item w-full text-left text-[13px]">
              <span className="flex-1">{LOCALE_LABEL[option]}</span>{option === locale && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
