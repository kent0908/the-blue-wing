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

// Raw multipart upload, not base64/JSON — so this is the real file-size cap,
// not inflated by base64 the way an embedded data URL would be. Kept under
// Vercel's ~4.5MB serverless request body limit (see lib/assets.ts for the
// same reasoning on image uploads).
export const MAX_VIDEO_REF_BYTES = 4 * 1024 * 1024;

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
