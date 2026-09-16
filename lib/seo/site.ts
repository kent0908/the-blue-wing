import { k } from "../i18n/k";
/**
 * One source of truth for how the site presents itself to search engines
 * and AI assistants: canonical origin, name, the one-sentence definition
 * every public page repeats (entity clarity — see the GEO plan), and the
 * JSON-LD helpers pages embed.
 */
export const SITE_URL = "https://thebluewing.studio";
export const SITE_NAME = "The Blue Wing";
export const SITE_TAGLINE = k("AI 影片、圖片與創作平台");
/** The definition sentence. Keep the wording identical wherever it appears. */
export const SITE_DEFINITION = k(
  "The Blue Wing 是台灣的 AI 影片與圖片創作平台，把 Seedance、Veo、GPT image、Seedream、Gemini 等模型收在同一個介面裡：文生影、圖生影、首尾幀、參考素材、智慧畫布、3D 導演台、圖層編輯與 AI 陪聊角色，一句話就能出片。");
export const DEFAULT_DESCRIPTION = k(
  "The Blue Wing 把頂尖的影片、圖片與文字模型收在同一個介面裡：Seedance 2.5、Veo 3.1、GPT image 2.5、Seedream 5.0。文生影、圖生影、首尾幀、智慧畫布、3D 導演台，一句話就能出片。");

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** Serialises a schema.org object for a <script type="application/ld+json">. `<` is escaped so user text can't break out of the script tag. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\u003c");
}

export function organizationLd() {
  return jsonLd({
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon.png"),
    description: SITE_DEFINITION,
    areaServed: "TW",
  });
}

export function webSiteLd() {
  return jsonLd({
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "zh-Hant",
    publisher: { "@id": `${SITE_URL}/#organization` },
  });
}

export function faqLd(entries: { question: string; answer: string }[]) {
  return jsonLd({
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({ "@type": "Question", name: e.question, acceptedAnswer: { "@type": "Answer", text: e.answer } })),
  });
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return jsonLd({
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  });
}

/** Metadata fragment for pages that must never be indexed (everything behind the login wall, auth forms, back office). */
export const NOINDEX = { robots: { index: false, follow: false, nocache: true } } as const;
