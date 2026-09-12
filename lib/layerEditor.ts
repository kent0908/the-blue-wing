/**
 * 圖層編輯 (Layer Editor) — a standalone multi-image compositing + local
 * mask-redraw tool, separate from 智慧畫布 (that's a node-graph workflow
 * builder; this is a flat layer canvas, closer to what 即夢's "智能画布"
 * actually is). Two real, verified-live capabilities drive what this does
 * and doesn't do:
 *
 *   - "AI 生成/融合": flattens the visible layers into one composite image
 *     client-side (plain canvas 2D, see flattenLayers below) and sends that
 *     as a single image-to-image reference to /api/images with the prompt —
 *     the existing endpoint, same one Composer/Canvas already use. This is
 *     NOT literal pixel compositing on SIRAYA's side — Seedream treats a
 *     reference image as visual inspiration, not a locked layout (verified
 *     empirically earlier this session: positional instructions like "use
 *     the shape from image 1" get ignored) — so the canvas arrangement is a
 *     genuine planning aid, not a guarantee the output matches it exactly.
 *   - "局部重繪" (local redraw): a real, separate SIRAYA endpoint
 *     (/images/edits, see lib/siraya.ts's createImageEdit) that takes a
 *     source image + an optional mask and edits in place. Verified live
 *     against SIRAYA-Dola-Seedream-5.0-pro on 2026-09-06 with a real mask
 *     parameter accepted and a real edited image returned.
 *
 * Deliberately NOT here, because SIRAYA's docs don't show an endpoint for
 * any of them: outpainting/canvas extension, background removal, HD
 * upscale. 即夢 has all three; this doesn't, rather than faking them.
 */

export interface EditorLayer {
  id: string;
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** degrees */
  rotation: number;
  visible: boolean;
}

let seq = 0;
export function newLayerId(): string {
  seq += 1;
  return `layer_${Date.now().toString(36)}_${seq}`;
}

/** Fits a newly-added image within ~60% of the canvas, centered, aspect preserved. */
export function fitLayer(src: string, name: string, canvasW: number, canvasH: number, naturalW: number, naturalH: number): EditorLayer {
  const scale = Math.min((canvasW * 0.6) / naturalW, (canvasH * 0.6) / naturalH, 1);
  const width = Math.max(20, naturalW * scale);
  const height = Math.max(20, naturalH * scale);
  return {
    id: newLayerId(),
    src,
    name,
    x: (canvasW - width) / 2,
    y: (canvasH - height) / 2,
    width,
    height,
    rotation: 0,
    visible: true,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載入失敗：${src.slice(0, 60)}`));
    img.src = src;
  });
}

/**
 * Flattens every visible layer (in z-order, first = bottom) onto a white
 * canvasW×canvasH background. Returns a JPEG (q0.92) data URL, not PNG —
 * same 413 class of bug toDataUrl below already fixed for 局部重繪 (2026-09-06)
 * but that was still live here for "AI 生成/融合" (found 2026-09-12): a
 * 1280×1280 lossless PNG of detailed artwork can run several MB, and as a
 * JSON POST body to /api/images that hits Vercel's ~4.5MB request limit
 * before our route ever runs. The background is already filled white, so
 * dropping alpha loses nothing.
 */
export async function flattenLayers(layers: EditorLayer[], canvasW: number, canvasH: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器不支援 canvas 合成");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);
  for (const layer of layers) {
    if (!layer.visible) continue;
    const img = await loadImage(layer.src);
    ctx.save();
    ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    ctx.restore();
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Re-encodes any image src as a same-origin data URL — needed before sending
 * a layer to SIRAYA, since an asset-library src is our own authenticated
 * proxy route (SIRAYA's servers can't fetch that), and downscales anything
 * oversized to keep the request small.
 *
 * Encodes JPEG, not PNG: a real user report (2026-09-06) hit a silent
 * "重繪失敗" with no detail from /api/images/edit — root cause was this
 * function re-encoding an uploaded illustration losslessly as PNG at up to
 * 1536px, which for detailed artwork can run several MB; combined with the
 * mask, the JSON POST body blew past Vercel's serverless request-body limit
 * (~4.5MB), so the platform rejected it before our route ever ran, returning
 * a non-JSON error the client couldn't extract a message from. JPEG at
 * quality 0.92 is typically a fraction of the size for photographic/painted
 * content and is plenty for a reference image the model re-draws from
 * (this isn't the final output). Filled white first since JPEG has no alpha
 * channel — an unpainted canvas is transparent black, which would otherwise
 * turn a transparent source into a black background instead.
 */
export async function toDataUrl(src: string, maxDim = 1280): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器不支援 canvas 合成");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export const CANVAS_SIZES: { label: string; width: number; height: number }[] = [
  { label: "1:1 · 1024×1024", width: 1024, height: 1024 },
  { label: "16:9 · 1280×720", width: 1280, height: 720 },
  { label: "9:16 · 720×1280", width: 720, height: 1280 },
  { label: "4:3 · 1200×900", width: 1200, height: 900 },
];
