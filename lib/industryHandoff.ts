import type { Locale } from "./i18n/locale";

const KEY = "tbw:industry-brief:v1";
const TTL_MS = 60 * 60 * 1000;
export type IndustryBriefHandoff = { token: string; mode: "image" | "video"; prompt: string; createdAt: number; locale: Locale };
type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Called only by the explicit review-form submission. */
export function createIndustryHandoff(storage: StorageLike, mode: IndustryBriefHandoff["mode"], prompt: string, locale: Locale): string {
  return saveIndustryHandoff(storage, { token: crypto.randomUUID(), mode, prompt, locale, createdAt: Date.now() });
}

/** Stable primitive snapshot for React's external-store subscription. Empty means unavailable. */
export function industryHandoffSnapshot(storage: StorageLike, token: string): string {
  const value = readIndustryHandoff(storage, token);
  return value ? JSON.stringify(value) : "";
}

/** Private, tab-scoped draft handoff. Never puts the brief in a URL or calls a generation API. */
export function saveIndustryHandoff(storage: StorageLike, data: IndustryBriefHandoff): string {
  if (!valid(data, data.token, data.createdAt)) throw new Error("Invalid industry brief");
  storage.setItem(KEY, JSON.stringify(data));
  return `/studio?${new URLSearchParams({ mode: data.mode, brief: data.token })}`;
}

export function readIndustryHandoff(storage: StorageLike, token: string, now = Date.now()): IndustryBriefHandoff | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    return valid(data, token, now) ? data : null;
  } catch { return null; }
}

function valid(data: unknown, token: string, now: number): data is IndustryBriefHandoff {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<IndustryBriefHandoff>;
  return typeof token === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(token) && value.token === token &&
    (value.mode === "image" || value.mode === "video") && typeof value.prompt === "string" &&
    value.prompt.trim().length > 0 && value.prompt.length <= 12000 &&
    (value.locale === "zh-Hant" || value.locale === "en" || value.locale === "ja") &&
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt) &&
    Number.isFinite(now) && now >= value.createdAt && now - value.createdAt < TTL_MS;
}
