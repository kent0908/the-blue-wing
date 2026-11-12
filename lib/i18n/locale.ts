/**
 * Locale plumbing shared by server and client. The choice lives in a plain
 * (non-httpOnly) cookie so the globe menu can set it from the browser and
 * every server render reads the same value; no URL prefix, so nothing in
 * the app's routing changes. Default stays Traditional Chinese.
 */
export const LOCALES = ["zh-Hant", "zh-Hans", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-Hant";
export const LOCALE_COOKIE = "bw_lang";

export const LOCALE_LABEL: Record<Locale, string> = { "zh-Hant": "繁體中文", "zh-Hans": "简体中文", en: "English", ja: "日本語" };
/** BCP 47 language tags for the document and captions. */
export const LOCALE_TAG: Record<Locale, string> = { "zh-Hant": "zh-Hant", "zh-Hans": "zh-Hans", en: "en", ja: "ja" };
export const LOCALE_INTL: Record<Locale, string> = { "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", en: "en-US", ja: "ja-JP" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Best guess from Accept-Language for a first visit without the cookie. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const preferences = (header ?? "").toLowerCase().split(",").map(part => {
    const [tag, ...params] = part.trim().split(";");
    const quality = params.find(param => /^q\s*=/.test(param.trim()));
    return { tag: tag.trim(), weight: quality === undefined ? 1 : Number(quality.split("=")[1]) };
  }).filter(({ weight }) => weight > 0 && weight <= 1).sort((a, b) => b.weight - a.weight);
  for (const { tag } of preferences) {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(tag)) continue;
    const [language, scriptOrRegion] = tag.split("-");
    if (language === "ja" || language === "en") return language;
    if (language !== "zh") continue;
    if (scriptOrRegion === "hant") return "zh-Hant";
    if (scriptOrRegion === "hans" || scriptOrRegion === "cn" || scriptOrRegion === "sg" || scriptOrRegion === "my") return "zh-Hans";
    return "zh-Hant";
  }
  return DEFAULT_LOCALE;
}
