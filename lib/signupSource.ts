import type { NextRequest } from "next/server";

/** Cookie name shared with proxy.ts (which sets it on the Edge). */
export const SOURCE_COOKIE = "bw_src";

export interface SignupSource {
  ref: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing: string;
  at: string;
  /** derived bucket for reports */
  channel: "organic" | "ai" | "social" | "paid" | "referral" | "direct";
}

const AI_HOSTS = /chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google|copilot\.microsoft|claude\.ai|you\.com|bing\.com\/chat/i;
const SEARCH_HOSTS = /google\.|bing\.com|duckduckgo|yahoo\.|baidu\.com|yandex\./i;
const SOCIAL_HOSTS = /threads\.(net|com)|instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|t\.co|dcard\.tw|ptt\.cc|reddit\.com|youtube\.com|youtu\.be|tiktok\.com|line\.me|discord/i;

export function channelOf(src: { ref: string; utm_medium: string | null; utm_source: string | null }): SignupSource["channel"] {
  const medium = (src.utm_medium ?? "").toLowerCase();
  if (/cpc|ppc|paid|ads?/.test(medium)) return "paid";
  if (/social/.test(medium)) return "social";
  const ref = src.ref || src.utm_source || "";
  if (!ref) return "direct";
  if (AI_HOSTS.test(ref)) return "ai";
  if (SEARCH_HOSTS.test(ref)) return "organic";
  if (SOCIAL_HOSTS.test(ref)) return "social";
  return "referral";
}

/** Reads the first-touch cookie set by proxy.ts; tolerant of anything malformed. */
export function readSignupSource(req: NextRequest): SignupSource | null {
  const raw = req.cookies.get(SOURCE_COOKIE)?.value;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<SignupSource>;
    const base = {
      ref: typeof j.ref === "string" ? j.ref.slice(0, 300) : "",
      utm_source: typeof j.utm_source === "string" ? j.utm_source.slice(0, 80) : null,
      utm_medium: typeof j.utm_medium === "string" ? j.utm_medium.slice(0, 80) : null,
      utm_campaign: typeof j.utm_campaign === "string" ? j.utm_campaign.slice(0, 120) : null,
      landing: typeof j.landing === "string" ? j.landing.slice(0, 300) : "",
      at: typeof j.at === "string" ? j.at : new Date().toISOString(),
    };
    return { ...base, channel: channelOf(base) };
  } catch {
    return null;
  }
}
