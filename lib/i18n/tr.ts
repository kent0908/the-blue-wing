import type { Locale } from "./locale";
import { EN } from "./strings/en";
import { JA } from "./strings/ja";

/**
 * String-keyed translation for the long tail of UI copy: the Traditional
 * Chinese text IS the key, so a component reads `tr("尚未設定")` and keeps
 * working (in Chinese) for any string nobody has translated yet — a missing
 * entry can never blank a label. Structured, per-surface copy lives in
 * dict.ts; this is for everything else, including messages that originate
 * elsewhere (API errors, lib helpers) and are translated at display time.
 *
 * `{name}`-style placeholders are substituted after lookup so the table
 * key stays stable regardless of the value.
 */
const TABLES: Record<Locale, Record<string, string>> = { "zh-Hant": {}, en: EN, ja: JA };

export type Tr = (zh: string | null | undefined, vars?: Record<string, string | number>) => string;

export function translate(locale: Locale, zh: string | null | undefined, vars?: Record<string, string | number>): string {
  if (zh === null || zh === undefined) return "";
  const out = locale === "zh-Hant" ? zh : (TABLES[locale][zh] ?? zh);
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : out;
}

const TR_CACHE = new Map<Locale, Tr>();
/** One stable function per locale, so components can hold it in hook deps without re-running effects every render. */
export function trFor(locale: Locale): Tr {
  let fn = TR_CACHE.get(locale);
  if (!fn) {
    fn = (zh, vars) => translate(locale, zh, vars);
    TR_CACHE.set(locale, fn);
  }
  return fn;
}

/** Which keys a locale is still missing — used by scripts/check-i18n.cjs. */
export function missingKeys(locale: Locale, keys: Iterable<string>): string[] {
  const table = TABLES[locale];
  return [...keys].filter((k) => !(k in table));
}

export { k } from "./k";
