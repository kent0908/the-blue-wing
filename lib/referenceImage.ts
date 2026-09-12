import sharp, { type Metadata } from "sharp";

/**
 * Server-side normalisation of every raster image that goes to SIRAYA as a
 * reference (image-to-image `image`, video `input_references`, /images/edits
 * sources, companion avatars for idle/outfit/scene clips).
 *
 * Two real, opposite size problems drove this, both of which used to just
 * fail the generation with an upstream error (or worse, a 413 before our
 * code ran) instead of being fixed on the way through:
 *
 *   - too small: SIRAYA rejects references under roughly 300px a side
 *     (verified live for Seedance input_references, and the help page has
 *     told users "至少 300×300" since). A 200px avatar picked from the
 *     asset library, or a 3D導演台 screenshot from a tiny viewport, simply
 *     couldn't be used. Upscaled here to REF_MIN_SIDE (lanczos3 — soft, but
 *     a reference the model re-draws from, not final output).
 *   - too big: a 4000px PNG asset became a ~5MB base64 data URL per
 *     reference — four of them in one /images/generations body — and a
 *     screenshot/composite data URL coming from the browser could blow the
 *     ~4.5MB serverless request limit. Downscaled to REF_MAX_SIDE, which is
 *     still above every generation size the catalogue offers as input.
 *
 * Re-encoded output is JPEG (q90), except that PNG is kept when the source
 * has an alpha channel (masks / transparent edits — GPT-Image `background`,
 * the layer editor's local redraw — must survive) or is a small opaque PNG
 * that didn't need resizing (left byte-identical). Animated GIFs are flattened to
 * their first frame — SIRAYA reads a still anyway. EXIF orientation is
 * baked in (`.rotate()` with no args) so a phone photo isn't handed over
 * sideways. Anything sharp can't decode (SVG without librsvg, corrupt data)
 * is passed through untouched rather than failing the request here — the
 * upstream error message in that case is at least specific.
 */
export const REF_MIN_SIDE = 320;
export const REF_MAX_SIDE = 2048;

export interface NormalizedImage {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  /** true when the bytes were re-encoded (resized or format-changed) */
  changed: boolean;
}

export async function normalizeReferenceImage(input: Buffer, contentType: string): Promise<NormalizedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { animated: false }).metadata();
  } catch {
    return { buffer: input, contentType, width: 0, height: 0, changed: false };
  }
  // EXIF orientation 5-8 swap width/height once rotated in.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height ?? 0 : meta.width ?? 0;
  const height = rotated ? meta.width ?? 0 : meta.height ?? 0;
  if (!width || !height) return { buffer: input, contentType, width, height, changed: false };

  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  let scale = 1;
  if (minSide < REF_MIN_SIDE) scale = REF_MIN_SIDE / minSide;
  if (maxSide * scale > REF_MAX_SIDE) scale = REF_MAX_SIDE / maxSide;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const isJpeg = contentType === "image/jpeg";
  const isPng = contentType === "image/png";
  const hasAlpha = !!meta.hasAlpha;
  const animated = (meta.pages ?? 1) > 1;
  const needsResize = scale !== 1;
  // An opaque PNG is only re-encoded (to JPEG) when it's big enough to
  // matter for the request body — a small one is left byte-identical.
  const oversizedPng = isPng && !hasAlpha && input.length > 1_500_000;
  const needsReencode = (!isJpeg && !isPng) || animated || (meta.orientation ?? 1) !== 1 || (hasAlpha && !isPng) || oversizedPng;
  if (!needsResize && !needsReencode) return { buffer: input, contentType, width, height, changed: false };

  try {
    let pipeline = sharp(input, { animated: false }).rotate();
    if (needsResize) pipeline = pipeline.resize(targetW, targetH, { kernel: "lanczos3", fit: "fill" });
    // Only alpha earns PNG on re-encode: an opaque PNG that has to be
    // resized is written as JPEG — verified while testing that a 76KB
    // patterned PNG resized 2200→2048 as PNG ballooned to 7.6MB, exactly the
    // request-size problem this function exists to prevent.
    const keepPng = hasAlpha;
    const out = keepPng ? await pipeline.png({ compressionLevel: 8 }).toBuffer() : await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return { buffer: out, contentType: keepPng ? "image/png" : "image/jpeg", width: targetW, height: targetH, changed: true };
  } catch {
    return { buffer: input, contentType, width, height, changed: false };
  }
}

const DATA_URL_RE = /^data:([^;,]+)(;base64)?,([\s\S]*)$/;

/** Same normalisation for a `data:image/...;base64,...` string; non-image / malformed values are returned as-is (width/height 0). */
export async function normalizeReferenceDataUrlDetailed(value: string): Promise<{ value: string; width: number; height: number; changed: boolean }> {
  const m = DATA_URL_RE.exec(value);
  if (!m || !m[1].startsWith("image/")) return { value, width: 0, height: 0, changed: false };
  const buffer = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  const out = await normalizeReferenceImage(buffer, m[1]);
  if (!out.changed) return { value, width: out.width, height: out.height, changed: false };
  return { value: `data:${out.contentType};base64,${out.buffer.toString("base64")}`, width: out.width, height: out.height, changed: true };
}

export async function normalizeReferenceDataUrl(value: string): Promise<string> {
  return (await normalizeReferenceDataUrlDetailed(value)).value;
}

/**
 * Resizes a mask to exactly `width`×`height` (nearest-neighbour so painted
 * regions stay hard-edged) — /images/edits needs the mask and source to
 * share dimensions, so whenever the source was normalised the mask must
 * follow. Kept as PNG: the mask's transparency IS the signal.
 */
export async function resizeMaskDataUrl(value: string, width: number, height: number): Promise<string> {
  const m = DATA_URL_RE.exec(value);
  if (!m || !m[1].startsWith("image/") || !m[2]) return value;
  try {
    const buffer = Buffer.from(m[3], "base64");
    const meta = await sharp(buffer).metadata();
    if (meta.width === width && meta.height === height) return value;
    const out = await sharp(buffer).resize(width, height, { kernel: "nearest", fit: "fill" }).png().toBuffer();
    return `data:image/png;base64,${out.toString("base64")}`;
  } catch {
    return value;
  }
}
