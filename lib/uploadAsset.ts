"use client";

import { upload } from "@vercel/blob/client";
import { ALLOWED_ASSET_TYPES, MAX_ASSET_BYTES, MAX_ASSET_BYTES_DIRECT, type PublicAsset } from "./assets";

export interface UploadAssetOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class UploadAssetError extends Error {
  code: string;
  constructor(message: string, code = "upload_failed") {
    super(message);
    this.code = code;
  }
}

async function readError(res: Response, fallback: string): Promise<UploadAssetError> {
  const j = await res.json().catch(() => ({}));
  return new UploadAssetError(j?.error?.message || fallback, j?.error?.code || "upload_failed");
}

/**
 * The one way the browser adds a file to 資產庫. Goes browser → Vercel Blob
 * directly (token from /api/assets/upload, then /api/assets/register turns
 * the finished blob into a library row) — so the 4MB ceiling that every
 * uploader used to hit (Vercel's ~4.5MB serverless request-body limit on
 * the old multipart route) no longer applies; the cap is
 * MAX_ASSET_BYTES_DIRECT. Files over ~8MB use Blob's multipart mode so a
 * flaky connection retries parts instead of the whole file.
 *
 * Falls back to the legacy multipart POST /api/assets only when the token
 * route says direct upload isn't available on this deployment (no
 * BLOB_READ_WRITE_TOKEN — e.g. a local dev setup) and the file fits its 4MB
 * limit; a bigger file in that situation gets a clear error, not a fake
 * success.
 */
export async function uploadAsset(file: File, opts: UploadAssetOptions = {}): Promise<PublicAsset> {
  if (!ALLOWED_ASSET_TYPES[file.type]) {
    throw new UploadAssetError("接受圖片、MP4 / WebM 影片及 MP3 / WAV / M4A 音訊", "bad_type");
  }
  if (file.size > MAX_ASSET_BYTES_DIRECT) {
    throw new UploadAssetError(`檔案太大，單檔上限 ${Math.floor(MAX_ASSET_BYTES_DIRECT / 1024 / 1024)} MB`, "too_large");
  }

  if (!(await directUploadAvailable())) return uploadAssetLegacy(file);

  const safe = (file.name || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  // The token route pins the prefix to the session's user, so the pathname
  // has to carry that id — fetched once per page from /api/auth/me.
  const userId = await currentUserId();
  if (!userId) throw new UploadAssetError("請先登入", "unauthorized");
  const pathname = `assets/${userId}/${Date.now()}-${safe}`;

  let blobPathname: string;
  try {
    const result = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/assets/upload",
      contentType: file.type,
      multipart: file.size > 8 * 1024 * 1024,
      abortSignal: opts.signal,
      onUploadProgress: (p) => opts.onProgress?.(p.percentage / 100),
    });
    blobPathname = result.pathname;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.signal?.aborted) throw new UploadAssetError("已取消", "aborted");
    // @vercel/blob's client only says "Failed to retrieve the client token"
    // for any non-2xx from the token route — reword the common cases.
    if (/retrieve the client token/i.test(message)) throw new UploadAssetError("無法取得上傳授權，請重新登入後再試", "upload_token_failed");
    throw new UploadAssetError(message.replace(/^Vercel Blob:\s*/, "") || "上傳失敗，請稍後再試");
  }

  const reg = await fetch("/api/assets/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname: blobPathname, filename: (file.name || "asset").slice(0, 120) }),
  });
  if (!reg.ok) throw await readError(reg, "上傳完成但登錄失敗，請重新整理後再試");
  const j = (await reg.json()) as { asset: PublicAsset };
  opts.onProgress?.(1);
  return j.asset;
}

let availability: Promise<boolean> | null = null;
function directUploadAvailable(): Promise<boolean> {
  availability ??= fetch("/api/assets/upload", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: boolean }) => !!j.available)
    .catch(() => false);
  return availability;
}

let userIdPromise: Promise<number | null> | null = null;
function currentUserId(): Promise<number | null> {
  userIdPromise ??= fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { user?: { id?: number | string } } | null) => {
      const id = Number(j?.user?.id);
      if (!id) userIdPromise = null; // don't cache "logged out" — the user may sign in without a reload
      return id || null;
    })
    .catch(() => {
      userIdPromise = null;
      return null;
    });
  return userIdPromise;
}

async function uploadAssetLegacy(file: File): Promise<PublicAsset> {
  if (file.size > MAX_ASSET_BYTES) {
    throw new UploadAssetError(`這個環境目前只能上傳 ${Math.floor(MAX_ASSET_BYTES / 1024 / 1024)} MB 以內的檔案`, "too_large");
  }
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/assets", { method: "POST", body: fd });
  if (!res.ok) throw await readError(res, "上傳失敗，請稍後再試");
  const j = (await res.json()) as { asset: PublicAsset };
  return j.asset;
}

/** Convenience for callers that hold a data URL (3D導演台 screenshots) rather than a File. */
export async function uploadDataUrlAsset(dataUrl: string, filename: string, opts?: UploadAssetOptions): Promise<PublicAsset> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  return uploadAsset(file, opts);
}
