import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage, type Locale } from "./locale";
import { DICTS, type Dict } from "./dict";
import { trFor, type Tr } from "./tr";

/** Locale for the current server render: cookie first, then Accept-Language, then zh-Hant. */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  try {
    return localeFromAcceptLanguage((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: DICTS[locale] };
}

export async function getTr(): Promise<Tr> {
  return trFor(await getLocale());
}

/** For route handlers: the locale from the request's own cookie / Accept-Language. */
export function localeFromRequest(req: { cookies: { get(name: string): { value: string } | undefined }; headers: { get(name: string): string | null } }): Locale {
  const c = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return localeFromAcceptLanguage(req.headers.get("accept-language"));
}
