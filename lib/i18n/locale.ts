/**
 * Locale plumbing shared by server and client. The choice lives in a plain
 * (non-httpOnly) cookie so the globe menu can set it from the browser and
 * every server render reads the same value; no URL prefix, so nothing in
 * the app's routing changes. Default stays Traditional Chinese.
 */
export const LOCALES = ["zh-Hant", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-Hant";
export const LOCALE_COOKIE = "bw_lang";

export const LOCALE_LABEL: Record<Locale, string> = { "zh-Hant": "繁體中文", en: "English", ja: "日本語" };
/** BCP-47 value for <html lang> and Intl */
export const LOCALE_TAG: Record<Locale, string> = { "zh-Hant": "zh-Hant", en: "en", ja: "ja" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Best guess from Accept-Language for a first visit without the cookie. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const h = (header ?? "").toLowerCase();
  for (const part of h.split(",")) {
    const tag = part.trim().split(";")[0];
    if (!tag) continue;
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("zh")) return "zh-Hant";
  }
  return DEFAULT_LOCALE;
}
