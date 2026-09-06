/**
 * Admin-managed media (image/video) shown on the public landing page
 * (app/page.tsx) — one fixed slot per hero/feature visual, overridable
 * independently. See scripts/schema.sql's landing_media table.
 *
 * Deliberately separate from the per-user 資產庫 (lib/assets.ts) and from
 * generated-media re-hosting (lib/mediaStore.ts): those are both
 * ownership-gated and served only to the uploading user. This is the
 * opposite — one shared, admin-only-writable, publicly-readable set of
 * slots, served with no auth check at all via /api/landing-media/[slot]
 * (anonymous visitors load the landing page).
 */
import { sql } from "./db";

export interface LandingSlotDef {
  key: string;
  label: string;
  hint: string;
}

export const LANDING_SLOTS: LandingSlotDef[] = [
  { key: "hero", label: "首頁主視覺（Hero 背景）", hint: "全螢幕背景，建議短循環影片或大圖" },
  { key: "video", label: "「讓想像，開始流動」展示區", hint: "影片創作區塊的視覺" },
  { key: "image", label: "「每個靈感，都值得被看見」展示區", hint: "圖片創作區塊的視覺" },
  { key: "canvas", label: "「把創意連起來」展示區", hint: "智慧畫布區塊的視覺" },
  { key: "companions", label: "「創造TA，然後愛上與TA相處」展示區", hint: "AI 陪聊區塊的視覺" },
];
const LANDING_SLOT_KEYS = new Set(LANDING_SLOTS.map((s) => s.key));
export function isLandingSlot(key: string): boolean {
  return LANDING_SLOT_KEYS.has(key);
}

// 30MB covers a short (few-second), reasonably compressed looping hero clip
// without inviting someone to dump a multi-minute video into a landing page.
export const MAX_LANDING_MEDIA_BYTES = 30 * 1024 * 1024;

export const ALLOWED_LANDING_TYPES: Record<string, { ext: string; kind: "image" | "video" }> = {
  "image/png": { ext: "png", kind: "image" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
};

export interface LandingMediaRow {
  slot: string;
  kind: "image" | "video";
  pathname: string;
  content_type: string;
  updated_at: string;
}

export async function listLandingMedia(): Promise<LandingMediaRow[]> {
  const { rows } = await sql<LandingMediaRow>`select * from landing_media`;
  return rows;
}

export interface PublicLandingMedia {
  kind: "image" | "video";
  url: string;
  updatedAt: string;
}

/** slot -> public info, for both the landing page itself and the admin listing. */
export async function getLandingMediaMap(): Promise<Record<string, PublicLandingMedia>> {
  const rows = await listLandingMedia();
  const out: Record<string, PublicLandingMedia> = {};
  for (const r of rows) {
    out[r.slot] = { kind: r.kind, url: `/api/landing-media/${r.slot}`, updatedAt: r.updated_at };
  }
  return out;
}

export async function getLandingMediaPathname(slot: string): Promise<{ pathname: string; content_type: string } | null> {
  const { rows } = await sql<{ pathname: string; content_type: string }>`
    select pathname, content_type from landing_media where slot = ${slot} limit 1
  `;
  return rows[0] ?? null;
}

export async function upsertLandingMedia(slot: string, kind: "image" | "video", pathname: string, contentType: string): Promise<void> {
  await sql`
    insert into landing_media (slot, kind, pathname, content_type, updated_at)
    values (${slot}, ${kind}, ${pathname}, ${contentType}, now())
    on conflict (slot) do update
      set kind = excluded.kind, pathname = excluded.pathname, content_type = excluded.content_type, updated_at = now()
  `;
}

export async function deleteLandingMediaRow(slot: string): Promise<void> {
  await sql`delete from landing_media where slot = ${slot}`;
}
