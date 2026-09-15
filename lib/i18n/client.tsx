"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./locale";
import { DICTS, type Dict } from "./dict";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The whole dictionary for the active locale — `const t = useT(); t.nav.home`. */
export function useT(): Dict {
  return DICTS[useContext(LocaleContext)];
}

/** Writes the cookie the server reads; caller then router.refresh() so server components re-render. */
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}
