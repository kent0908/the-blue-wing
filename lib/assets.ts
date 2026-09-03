/** Shared config + shape for user-uploaded assets (資產庫). */

export const MAX_ASSET_BYTES = 4 * 1024 * 1024; // 4 MB — stays under Vercel's serverless body limit

export const ALLOWED_ASSET_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
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
    id: a.id,
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
