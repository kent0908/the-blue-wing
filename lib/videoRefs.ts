/**
 * Config + shape for temporary "reference video" uploads — a short clip
 * (typically a 3D導演台 錄製運鏡 capture) forwarded to SIRAYA as an
 * input_references entry of type "video" for Seedance's r2v mode (see
 * lib/videoModels.ts's supportsVideoRefInput, and app/api/videos/route.ts).
 *
 * Unlike 資產庫 assets, these aren't tied to a user's library or shown
 * anywhere in the UI as a picker — they're single-use-ish scratch files
 * served from a public, token-gated route (app/api/video-refs/[file]) since
 * SIRAYA's servers have to fetch the URL directly and can't authenticate as
 * this app's user the way a normal /api/assets/.../raw request does. See
 * app/api/video-refs/route.ts for the known limitation: nothing here
 * auto-deletes these blobs yet.
 */

// Legacy multipart POST /api/video-refs cap — the bytes pass through a
// serverless function body, so this stays under Vercel's ~4.5MB request
// limit (see lib/assets.ts for the same reasoning on image uploads). The
// browser now uploads straight to Blob (app/api/video-refs/upload) with the
// DIRECT cap and only falls back to this when that isn't available.
export const MAX_VIDEO_REF_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_REF_BYTES_DIRECT = 48 * 1024 * 1024;

/** Blob pathname a direct upload must use: the random 128-bit token IS the access control (see app/api/video-refs/[file]). */
export const VIDEO_REF_PATHNAME_RE = /^video-refs\/[0-9a-f]{32}\.(webm|mp4)$/;

export const ALLOWED_VIDEO_REF_TYPES: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
};

/**
 * SIRAYA rejects a reference clip below roughly 480p worth of pixels —
 * verified empirically against SIRAYA-Seedance-2.5 on 2026-09-06 (a 320x176
 * sample was rejected with "video pixel count ... must be greater than or
 * equal to 407696"; a 1280x720 sample was accepted). Checked client-side
 * before recording starts so a too-small viewport fails fast instead of
 * after a full 15-30s recording.
 */
export const MIN_VIDEO_REF_PIXELS = 410000;
