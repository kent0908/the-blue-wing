"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AccountDialog from "./AccountDialog";
import { IconGlobe, IconHelp, IconSparkle } from "./Icons";
import { setLocaleCookie, useLocale, useT } from "@/lib/i18n/client";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/locale";

interface Me {
  user: { email: string; role: string; nickname: string | null } | null;
  credits?: number;
  plan?: { code: string; name: string };
}

function LanguageMenu() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const choose = (l: Locale) => {
    setOpen(false);
    if (l === locale) return;
    setLocaleCookie(l);
    router.refresh();
  };
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={t.top.switchLanguage} title={t.top.switchLanguage}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] text-[#d4d4d4] transition-colors hover:text-white">
        <IconGlobe className="h-[17px] w-[17px]" />
        <span className="hidden text-[12.5px] md:inline">{LOCALE_LABEL[locale]}</span>
      </button>
      {open && (
        <div role="menu" aria-label={t.top.language} className="bw-menu absolute right-0 top-full z-50 mt-1 w-[150px] p-1.5">
          {LOCALES.map((l) => (
            <button key={l} role="menuitemradio" aria-checked={l === locale} type="button" onClick={() => choose(l)} className="bw-menu-item w-full text-left text-[13px]">
              <span className="flex-1">{LOCALE_LABEL[l]}</span>{l === locale && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const router = useRouter();
  const t = useT();
  const search=useSearchParams();
  const requestedAccount=search.get("account")==="1";
  const [accountOpen,setAccountOpen]=useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const refresh = () =>
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ user: null }));

  useEffect(() => {
    refresh();

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("profile-updated",onFocus);
    return () => { window.removeEventListener("focus", onFocus);window.removeEventListener("profile-updated",onFocus); };
  }, []);

  useEffect(()=>{if(requestedAccount)queueMicrotask(()=>setAccountOpen(true));},[requestedAccount]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/");
    router.refresh();
  };

  return (
    <><header className="flex h-14 shrink-0 items-center justify-end gap-1 whitespace-nowrap bg-black pr-2 sm:pr-6 [&>a]:shrink-0 [&>button]:shrink-0">
      <Link
        href="/help"
        aria-label={t.top.help}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] text-[#d4d4d4] transition-colors hover:text-white"
      >
        <IconHelp className="h-[17px] w-[17px]" />
        <span className="hidden sm:inline">{t.top.help}</span>
      </Link>
      <LanguageMenu />

      {me?.user ? (
        <>
          <button
            onClick={()=>setAccountOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-[#3a3a3a] px-3 py-1.5 text-[13px] text-white transition-colors hover:border-[#555]"
            title={t.top.credits}
          >
            <IconSparkle className="h-3.5 w-3.5 text-[#7ff0cd]" />
            {(me.credits ?? 0).toLocaleString()}
          </button>
          {me.user.role === "admin" && (
            <>
              <Link href="/crm" className="rounded-lg px-2 py-1.5 text-[13px] text-[#d4d4d4] hover:text-white">{t.top.admin}</Link>
            </>
          )}
          <button
            onClick={()=>setAccountOpen(true)}
            className="max-w-[80px] sm:max-w-[160px] truncate rounded-lg px-2 py-1.5 text-[13px] text-[#d4d4d4] transition-colors hover:text-white"
            aria-label={t.top.openAccount}
            title={me.user.nickname||t.top.account}
          >
            {me.user.nickname||t.top.account}
          </button>
          <button
            onClick={logout}
            className="rounded-lg px-2 py-1.5 text-[13px] text-[#8a8a8a] transition-colors hover:text-white"
          >
            {t.top.logout}
          </button>
        </>
      ) : (
        <>
          <Link
            href="/pricing"
            className="flex items-center gap-2 rounded-full border border-[#3a3a3a] px-3.5 py-1.5 text-[13px] text-white transition-colors hover:border-[#555]"
          >
            {t.top.pricing}
          </Link>
          <Link
            href="/login"
            className="ml-2 rounded-full bg-gradient-to-r from-[#22d3ee] to-[#3b82f6] px-3 sm:px-6 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {t.top.login}
          </Link>
        </>
      )}
    </header><AccountDialog open={accountOpen && !!me?.user} onClose={()=>setAccountOpen(false)}/></>
  );
}

