import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "./db";

export const GENERATION_ASSET_TTL_SECONDS = 3600;
export const GENERATION_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
function secret(): string {
  const value = process.env.GENERATION_ASSET_SECRET || process.env.SIRAYA_API_KEY;
  if (!value) throw new Error("素材分享簽章尚未設定");
  return value;
}
function positiveInt(value: number) { return Number.isSafeInteger(value) && value > 0; }
function signature(userId: number, assetId: number, expires: number) {
  return createHmac("sha256", secret()).update(`generation-image:v1:${userId}:${assetId}:${expires}`).digest("hex");
}
export function verifyGenerationAssetToken(userId: number, assetId: number, expires: number, token: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!positiveInt(userId) || !positiveInt(assetId) || !positiveInt(expires) || expires <= now || expires > now + GENERATION_ASSET_TTL_SECONDS || !/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(signature(userId, assetId, expires), "hex"), Buffer.from(token, "hex"));
}
function trustedOrigin(origin: string): string {
  const parsed = new URL(origin);
  const configured = [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.APP_URL, "https://the-blue-wing.vercel.app", ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`)];
  const allowed = configured.filter(Boolean).some(value => { try { return new URL(value!).origin === parsed.origin; } catch { return false; } });
  const local = process.env.NODE_ENV !== "production" && parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if ((!allowed || parsed.protocol !== "https:") && !local) throw new Error("素材分享來源不受信任");
  return parsed.origin;
}
/** Caller authenticates first. Each URL grants only one owned raster image for
 * one hour; never log these URLs or return them as permanent asset locations. */
export async function createGenerationAssetUrls(userId: number, assetIds: number[], origin: string): Promise<string[]> {
  if (!positiveInt(userId) || !Array.isArray(assetIds) || assetIds.length > 50 || assetIds.some(id => !positiveInt(id))) throw new Error("素材編號不正確");
  const base = trustedOrigin(origin);
  const expires = Math.floor(Date.now() / 1000) + GENERATION_ASSET_TTL_SECONDS;
  const urls: string[] = [];
  for (const assetId of assetIds) {
    const { rows } = await sql<{ id: number; content_type: string }>`select id, content_type from assets where id = ${assetId} and user_id = ${userId} limit 1`;
    if (!rows[0] || !GENERATION_IMAGE_TYPES.has(rows[0].content_type)) throw new Error("素材不存在或不支援此圖片格式");
    const query = new URLSearchParams({ user: String(userId), expires: String(expires), token: signature(userId, assetId, expires) });
    urls.push(`${base}/api/generation-assets/${assetId}?${query}`);
  }
  return urls;
}
