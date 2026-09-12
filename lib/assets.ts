/** Shared config + shape for user-uploaded assets (資產庫). */

/**
 * Cap for the legacy multipart POST /api/assets path, which routes the file
 * through a serverless function body and so must stay under Vercel's ~4.5MB
 * request limit. New uploads go browser → Blob directly (see
 * app/api/assets/upload + lib/uploadAsset.ts) and use MAX_ASSET_BYTES_DIRECT
 * instead; the old route is kept only as a fallback for tiny files.
 */
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
/** Direct browser → Blob uploads never touch a function body, so the ceiling is just storage sanity. */
export const MAX_ASSET_BYTES_DIRECT = 64 * 1024 * 1024;

/** Where a user's uploads live in the store — the token issuer and the register step both pin to this prefix. */
export function assetPathPrefix(userId: number | string): string {
  return `assets/${userId}/`;
}
export function assetPathname(userId: number | string, filename: string): string {
  const safe = (filename || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  return `${assetPathPrefix(userId)}${Date.now()}-${safe}`;
}

export const ALLOWED_ASSET_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
};

export interface AssetRow {
  id: number;
  user_id: number;
  url: string;
  pathname: string;
  content_type: string;
  size: number;
  filename: string | null;
  created_at: string;
}

export interface PublicAsset {
  id: number;
  /** authenticated proxy URL — the blob store is private, so raw URLs need auth */
  src: string;
  /** original upload filename — shown in the picker and used as the @mention label */
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export function toPublicAsset(a: AssetRow): PublicAsset {
  return {
    id: Number(a.id),
    src: `/api/assets/${a.id}/raw`,
    name: a.filename || `素材${a.id}`,
    contentType: a.content_type,
    size: a.size,
    createdAt: a.created_at,
  };
}

/** Turn an asset name into a safe @mention token — no spaces/@'s so the tag
 *  has an unambiguous end boundary in plain prompt text. */
export function mentionTag(name: string): string {
  return name.replace(/\s+/g, "_").replace(/@/g, "");
}

/**
 * Blob is reachable when either a static RW token is set, or the OIDC path is
 * wired (Vercel injects VERCEL_OIDC_TOKEN; the store connection adds BLOB_STORE_ID).
 */
export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}
