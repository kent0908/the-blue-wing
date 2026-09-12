/**
 * 圖層編輯 (Layer Editor) — a standalone multi-image compositing + local
 * mask-redraw tool, separate from 智慧畫布 (that's a node-graph workflow
 * builder; this is a flat layer canvas, closer to what 即夢's "智能画布"
 * actually is).
 *
 * This module is the editor's data model and its ONE renderer: `renderDoc`
 * draws a document onto a 2D canvas honouring every per-layer property
 * (crop, flip, opacity, blend mode, colour adjustments, text), and both the
 * on-screen DOM preview (app/editor) and every export/AI path are kept in
 * lock-step with it — flattenLayers() for the AI composite, exportDoc() for
 * downloads, and thumbnails for saved projects all go through renderDoc.
 *
 * AI capabilities, all verified live against SIRAYA:
 *   - "AI 生成/融合": flattened composite → /api/images as an image-to-image
 *     reference. NOT literal pixel compositing on SIRAYA's side — Seedream
 *     treats a reference as visual inspiration, not a locked layout.
 *   - "局部重繪": /images/edits with a mask (transparent = edit here).
 *   - "擴圖" (outpainting, verified 2026-09-12): the image placed on a larger
 *     transparent canvas with the margins marked editable in the mask —
 *     Dola-Seedream-5.0-pro continued the scene past the original edges
 *     with the centre preserved. See buildOutpaintRequest().
 *   - 去背 / 智慧選取 run in the browser (components/layerEditor/models.ts),
 *     since SIRAYA has no matting/segmentation endpoint.
 * Still not here because no endpoint exists: true super-resolution upscale.
 */

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: "normal", label: "正常" },
  { id: "multiply", label: "正片疊底" },
  { id: "screen", label: "濾色" },
  { id: "overlay", label: "覆蓋" },
  { id: "darken", label: "變暗" },
  { id: "lighten", label: "變亮" },
  { id: "color-dodge", label: "加亮顏色" },
  { id: "color-burn", label: "加深顏色" },
  { id: "hard-light", label: "實光" },
  { id: "soft-light", label: "柔光" },
  { id: "difference", label: "差異化" },
  { id: "exclusion", label: "排除" },
  { id: "hue", label: "色相" },
  { id: "saturation", label: "飽和度" },
  { id: "color", label: "顏色" },
  { id: "luminosity", label: "明度" },
];

/** CSS mix-blend-mode (DOM preview) and canvas globalCompositeOperation share names except "normal". */
export function canvasBlend(mode: BlendMode | undefined): GlobalCompositeOperation {
  return (!mode || mode === "normal" ? "source-over" : mode) as GlobalCompositeOperation;
}

/** Non-destructive colour adjustments — stored as parameters, applied at render time. */
export interface LayerAdjust {
  /** percent, 100 = unchanged */
  brightness: number;
  contrast: number;
  saturate: number;
  /** degrees */
  hue: number;
  /** px */
  blur: number;
  /** percent */
  grayscale: number;
  sepia: number;
}

export const DEFAULT_ADJUST: LayerAdjust = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0 };

/** The same filter string works for CSS `filter` and canvas `ctx.filter`. */
export function filterString(a: LayerAdjust | undefined): string {
  if (!a) return "none";
  const parts: string[] = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`);
  if (a.saturate !== 100) parts.push(`saturate(${a.saturate}%)`);
  if (a.hue !== 0) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.blur !== 0) parts.push(`blur(${a.blur}px)`);
  if (a.grayscale !== 0) parts.push(`grayscale(${a.grayscale}%)`);
  if (a.sepia !== 0) parts.push(`sepia(${a.sepia}%)`);
  return parts.length ? parts.join(" ") : "none";
}

/** Fractions (0-1) of the source image kept — {0,0,1,1} = no crop. */
export interface LayerCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: LayerCrop = { x: 0, y: 0, w: 1, h: 1 };

export const TEXT_FONTS: { id: string; label: string }[] = [
  { id: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", label: "黑體" },
  { id: "'Noto Serif TC', 'PMingLiU', serif", label: "明體" },
  { id: "Impact, 'Arial Black', sans-serif", label: "Impact" },
  { id: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { id: "'Courier New', monospace", label: "等寬" },
  { id: "'Comic Sans MS', 'Segoe Print', cursive", label: "手寫" },
];

export interface TextStyle {
  text: string;
  fontFamily: string;
  /** px, in canvas units */
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  strokeColor: string;
  strokeWidth: number;
  /** multiplier, 1.2 = 120% */
  lineHeight: number;
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  text: "文字",
  fontFamily: TEXT_FONTS[0].id,
  fontSize: 64,
  color: "#ffffff",
  bold: true,
  italic: false,
  align: "center",
  strokeColor: "#000000",
  strokeWidth: 0,
  lineHeight: 1.2,
};

export interface EditorLayer {
  id: string;
  kind: "image" | "text";
  /** image layers: URL / data URL of the source; text layers: "" */
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** degrees */
  rotation: number;
  visible: boolean;
  locked?: boolean;
  /** 0-1 */
  opacity?: number;
  blend?: BlendMode;
  flipX?: boolean;
  flipY?: boolean;
  crop?: LayerCrop;
  adjust?: LayerAdjust;
  text?: TextStyle;
  /**
   * Source before the last AI step (局部重繪 / 擴圖 / 去背) — what 比對 and
   * 回復 use. Only the immediately previous one; deeper history is the
   * project's version list.
   */
  previousSrc?: string;
  /** the crop/flip/adjust that were baked into the pixels by that AI step — restored together with previousSrc on 回復 */
  previousProps?: Pick<EditorLayer, "crop" | "flipX" | "flipY" | "adjust">;
}

export interface CanvasSpec {
  width: number;
  height: number;
  /** "transparent" or a CSS colour */
  background: string;
}

/** The whole editable state of one project — what gets saved. */
export interface EditorDoc {
  canvas: CanvasSpec;
  layers: EditorLayer[];
}

let seq = 0;
export function newLayerId(): string {
  seq += 1;
  return `layer_${Date.now().toString(36)}_${seq}`;
}

export const CANVAS_SIZES: { label: string; width: number; height: number }[] = [
  { label: "1:1 · 1024×1024", width: 1024, height: 1024 },
  { label: "16:9 · 1280×720", width: 1280, height: 720 },
  { label: "9:16 · 720×1280", width: 720, height: 1280 },
  { label: "4:3 · 1200×900", width: 1200, height: 900 },
  { label: "3:4 · 900×1200", width: 900, height: 1200 },
  { label: "2:3 · 1024×1536", width: 1024, height: 1536 },
  { label: "3:2 · 1536×1024", width: 1536, height: 1024 },
];

export function defaultDoc(): EditorDoc {
  return { canvas: { width: CANVAS_SIZES[0].width, height: CANVAS_SIZES[0].height, background: "#ffffff" }, layers: [] };
}

/** Fits a newly-added image within ~60% of the canvas, centered, aspect preserved. */
export function fitLayer(src: string, name: string, canvasW: number, canvasH: number, naturalW: number, naturalH: number): EditorLayer {
  const scale = Math.min((canvasW * 0.6) / naturalW, (canvasH * 0.6) / naturalH, 1);
  const width = Math.max(20, naturalW * scale);
  const height = Math.max(20, naturalH * scale);
  return {
    id: newLayerId(),
    kind: "image",
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

export function newTextLayer(canvasW: number, canvasH: number, style: Partial<TextStyle> = {}): EditorLayer {
  const text = { ...DEFAULT_TEXT_STYLE, ...style };
  // CJK glyphs are a full em wide — size the box for that so a short label isn't clipped on creation
  const longest = Math.max(...text.text.split("\n").map((l) => l.length), 1);
  const width = Math.min(canvasW * 0.9, Math.max(200, text.fontSize * longest * 1.05 + 32));
  const height = text.fontSize * text.lineHeight * Math.max(1, text.text.split("\n").length) + 16;
  return {
    id: newLayerId(),
    kind: "text",
    src: "",
    name: text.text.slice(0, 20) || "文字",
    x: (canvasW - width) / 2,
    y: (canvasH - height) / 2,
    width,
    height,
    rotation: 0,
    visible: true,
    text,
  };
}

/* ---- loading ---------------------------------------------------------- */

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(src);
        reject(new Error(`圖片載入失敗：${src.slice(0, 60)}`));
      };
      img.src = src;
    });
    imageCache.set(src, p);
    // data URLs can be several MB — don't keep those pinned forever
    if (imageCache.size > 40) imageCache.delete(imageCache.keys().next().value!);
  }
  return p;
}

export function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return loadImage(src).then((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
}

/* ---- rendering -------------------------------------------------------- */

export function fontString(t: TextStyle, scale = 1): string {
  return `${t.italic ? "italic " : ""}${t.bold ? "700" : "400"} ${t.fontSize * scale}px ${t.fontFamily}`;
}

/** Greedy wrap so canvas text matches the DOM preview's `pre-wrap` box; CJK (no spaces) breaks per character. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (ctx.measureText(line + word).width <= maxWidth) {
        line += word;
        continue;
      }
      if (line && !/^\s+$/.test(word)) {
        out.push(line.replace(/\s+$/, ""));
        line = "";
      }
      // token wider than the box on its own: break by character
      for (const ch of word.trimStart()) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          out.push(line);
          line = "";
        }
        line += ch;
      }
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: EditorLayer, scale: number) {
  const t = layer.text ?? DEFAULT_TEXT_STYLE;
  ctx.font = fontString(t, scale);
  ctx.textBaseline = "top";
  ctx.textAlign = t.align;
  const w = layer.width * scale;
  const lines = wrapText(ctx, t.text, w);
  const lh = t.fontSize * t.lineHeight * scale;
  const x = t.align === "left" ? -w / 2 : t.align === "right" ? w / 2 : 0;
  let y = -(layer.height * scale) / 2 + 8 * scale;
  for (const line of lines) {
    if (t.strokeWidth > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = t.strokeWidth * 2 * scale;
      ctx.strokeStyle = t.strokeColor;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, x, y);
    y += lh;
  }
}

export interface RenderOptions {
  /** output scale factor (2 = 2× pixels) */
  scale?: number;
  /** override the doc's background ("transparent" allowed) */
  background?: string;
  /** skip layers by id (e.g. the 標記 layer when exporting) */
  skipIds?: Set<string>;
  /** draw hidden layers too — off by default */
  includeHidden?: boolean;
}

/**
 * Draws the document to a fresh canvas. Every visual property is applied
 * here, in the same order the DOM preview applies it: crop → flip →
 * rotation about the layer centre → filter → opacity → blend.
 */
export async function renderDoc(doc: EditorDoc, opts: RenderOptions = {}): Promise<HTMLCanvasElement> {
  const scale = opts.scale ?? 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(doc.canvas.width * scale));
  canvas.height = Math.max(1, Math.round(doc.canvas.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器不支援 canvas 合成");
  const background = opts.background ?? doc.canvas.background;
  if (background && background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const layer of doc.layers) {
    if (!layer.visible && !opts.includeHidden) continue;
    if (opts.skipIds?.has(layer.id)) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.globalCompositeOperation = canvasBlend(layer.blend);
    ctx.filter = filterString(layer.adjust);
    ctx.translate((layer.x + layer.width / 2) * scale, (layer.y + layer.height / 2) * scale);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    if (layer.kind === "text") {
      // flip is ignored for text on purpose — mirrored glyphs are never what anyone wants
      drawTextLayer(ctx, layer, scale);
    } else {
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
      const img = await loadImage(layer.src);
      const c = layer.crop ?? FULL_CROP;
      ctx.drawImage(
        img,
        c.x * img.naturalWidth,
        c.y * img.naturalHeight,
        Math.max(1, c.w * img.naturalWidth),
        Math.max(1, c.h * img.naturalHeight),
        (-layer.width / 2) * scale,
        (-layer.height / 2) * scale,
        layer.width * scale,
        layer.height * scale
      );
    }
    ctx.restore();
  }
  return canvas;
}

/**
 * The AI composite: every visible layer on the doc's background, as a JPEG
 * (q0.92) data URL — JPEG, not PNG, because a 1280² lossless PNG of detailed
 * artwork can run several MB and, as a JSON POST body to /api/images, blow
 * Vercel's ~4.5MB request limit before our route runs (the same 413 class
 * the 2026-09-06 局部重繪 fix addressed). A transparent background is
 * flattened to white here since JPEG has no alpha.
 */
export async function flattenLayers(layers: EditorLayer[], canvasW: number, canvasH: number, background = "#ffffff", skipIds?: Set<string>): Promise<string> {
  const canvas = await renderDoc({ canvas: { width: canvasW, height: canvasH, background }, layers }, { background: background === "transparent" ? "#ffffff" : background, skipIds });
  return canvas.toDataURL("image/jpeg", 0.92);
}

export type ExportFormat = "png" | "jpeg" | "webp";

export async function exportDoc(doc: EditorDoc, format: ExportFormat, scale: number, transparent: boolean, skipIds?: Set<string>): Promise<Blob> {
  const background = transparent && format !== "jpeg" ? "transparent" : doc.canvas.background === "transparent" ? "#ffffff" : doc.canvas.background;
  const canvas = await renderDoc(doc, { scale, background, skipIds });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("匯出失敗"))), `image/${format}`, format === "png" ? undefined : 0.92));
}

/** Small JPEG preview of the whole doc — saved-project thumbnails. */
export async function docThumbnail(doc: EditorDoc, maxSide = 320): Promise<string> {
  const scale = Math.min(1, maxSide / Math.max(doc.canvas.width, doc.canvas.height));
  const canvas = await renderDoc(doc, { scale, background: doc.canvas.background === "transparent" ? "#222222" : doc.canvas.background });
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * Re-encodes any image src as a same-origin data URL — needed before sending
 * a layer to SIRAYA, since an asset-library src is our own authenticated
 * proxy route (SIRAYA's servers can't fetch that), and downscales anything
 * oversized to keep the request small. JPEG for the same 413 reason as
 * flattenLayers; `keepAlpha` switches to PNG for sources whose transparency
 * matters (a 去背 result being re-edited).
 */
export async function toDataUrl(src: string, maxDim = 1280, keepAlpha = false): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器不支援 canvas 合成");
  if (!keepAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Bakes a layer's crop/flip/adjust into real pixels — used before AI
 * operations on a single layer (局部重繪, 擴圖, 去背) so what the model sees
 * is what's on screen. Returns a PNG data URL at the source's own
 * resolution (capped at maxDim).
 */
export async function bakeLayerPixels(layer: EditorLayer, maxDim = 1536): Promise<string> {
  const img = await loadImage(layer.src);
  const c = layer.crop ?? FULL_CROP;
  const sw = Math.max(1, c.w * img.naturalWidth);
  const sh = Math.max(1, c.h * img.naturalHeight);
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.filter = filterString(layer.adjust);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  ctx.drawImage(img, c.x * img.naturalWidth, c.y * img.naturalHeight, sw, sh, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** After an AI step replaced a layer's pixels, the baked-in properties are already in the new source — clear them (remembering them for 回復). */
export function bakedPatch(newSrc: string, layer: EditorLayer): Partial<EditorLayer> {
  return {
    src: newSrc,
    previousSrc: layer.src,
    previousProps: { crop: layer.crop, flipX: layer.flipX, flipY: layer.flipY, adjust: layer.adjust },
    crop: undefined,
    flipX: false,
    flipY: false,
    adjust: undefined,
  };
}

/** Undo the last AI step: previous pixels and the properties that had been baked into them. */
export function revertPatch(layer: EditorLayer): Partial<EditorLayer> {
  if (!layer.previousSrc) return {};
  return { src: layer.previousSrc, ...(layer.previousProps ?? {}), previousSrc: undefined, previousProps: undefined };
}

/* ---- 擴圖 (outpainting) ------------------------------------------------ */

export interface OutpaintMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Builds the image + mask pair for an outpaint: the source (already baked)
 * sits on a larger transparent canvas; the mask is opaque over the source
 * (keep) and transparent on the margins (edit) — the same transparent-=-edit
 * convention 局部重繪 uses (see MaskPainter). Margins are fractions of the
 * source's own size. Verified live 2026-09-12 with Dola-Seedream-5.0-pro.
 */
export async function buildOutpaintRequest(bakedSrc: string, margins: OutpaintMargins, maxDim = 1536): Promise<{ image: string; mask: string; width: number; height: number; inner: { x: number; y: number; w: number; h: number } }> {
  const img = await loadImage(bakedSrc);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const fullW = sw * (1 + margins.left + margins.right);
  const fullH = sh * (1 + margins.top + margins.bottom);
  const scale = Math.min(1, maxDim / Math.max(fullW, fullH));
  const W = Math.round(fullW * scale);
  const H = Math.round(fullH * scale);
  const inner = { x: Math.round(sw * margins.left * scale), y: Math.round(sh * margins.top * scale), w: Math.round(sw * scale), h: Math.round(sh * scale) };
  const image = document.createElement("canvas");
  image.width = W;
  image.height = H;
  image.getContext("2d")!.drawImage(img, inner.x, inner.y, inner.w, inner.h);
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const mctx = mask.getContext("2d")!;
  mctx.fillStyle = "#000";
  mctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  return { image: image.toDataURL("image/png"), mask: mask.toDataURL("image/png"), width: W, height: H, inner };
}

/* ---- snapping & alignment ---------------------------------------------- */

export interface Guide {
  axis: "x" | "y";
  /** canvas-unit position */
  at: number;
}

/**
 * Snaps a moving rect's edges/centre to the canvas edges/centre and to other
 * layers' edges/centres within `threshold` canvas units. Returns the
 * adjusted position plus the guide lines to draw.
 */
export function snapRect(
  rect: { x: number; y: number; width: number; height: number },
  others: { x: number; y: number; width: number; height: number }[],
  canvas: { width: number; height: number },
  threshold: number
): { x: number; y: number; guides: Guide[] } {
  const xs: number[] = [0, canvas.width / 2, canvas.width];
  const ys: number[] = [0, canvas.height / 2, canvas.height];
  for (const o of others) {
    xs.push(o.x, o.x + o.width / 2, o.x + o.width);
    ys.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  const guides: Guide[] = [];
  let bestX: { d: number; shift: number; at: number } | null = null;
  for (const edge of [0, rect.width / 2, rect.width]) {
    for (const t of xs) {
      const d = Math.abs(rect.x + edge - t);
      if (d <= threshold && (!bestX || d < bestX.d)) bestX = { d, shift: t - (rect.x + edge), at: t };
    }
  }
  let bestY: { d: number; shift: number; at: number } | null = null;
  for (const edge of [0, rect.height / 2, rect.height]) {
    for (const t of ys) {
      const d = Math.abs(rect.y + edge - t);
      if (d <= threshold && (!bestY || d < bestY.d)) bestY = { d, shift: t - (rect.y + edge), at: t };
    }
  }
  if (bestX) guides.push({ axis: "x", at: bestX.at });
  if (bestY) guides.push({ axis: "y", at: bestY.at });
  return { x: rect.x + (bestX?.shift ?? 0), y: rect.y + (bestY?.shift ?? 0), guides };
}

export type AlignTarget = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

export function alignLayer(layer: EditorLayer, canvas: CanvasSpec, target: AlignTarget): Partial<EditorLayer> {
  switch (target) {
    case "left":
      return { x: 0 };
    case "centerX":
      return { x: (canvas.width - layer.width) / 2 };
    case "right":
      return { x: canvas.width - layer.width };
    case "top":
      return { y: 0 };
    case "centerY":
      return { y: (canvas.height - layer.height) / 2 };
    case "bottom":
      return { y: canvas.height - layer.height };
  }
}

/** Scales a layer to fit inside / cover the canvas, centred. */
export function fitToCanvas(layer: EditorLayer, canvas: CanvasSpec, mode: "contain" | "cover"): Partial<EditorLayer> {
  const s = mode === "contain" ? Math.min(canvas.width / layer.width, canvas.height / layer.height) : Math.max(canvas.width / layer.width, canvas.height / layer.height);
  const width = layer.width * s;
  const height = layer.height * s;
  return { width, height, x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, rotation: 0 };
}

/* ---- document hygiene -------------------------------------------------- */

/** Validates / fills defaults on a stored document (also tolerates the pre-rebuild plain layer array). */
export function normalizeDoc(raw: unknown): EditorDoc {
  const d = defaultDoc();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<EditorDoc> & { layers?: unknown };
  if (r.canvas && typeof r.canvas === "object") {
    d.canvas = {
      width: Math.min(4096, Math.max(64, Math.round(Number(r.canvas.width) || d.canvas.width))),
      height: Math.min(4096, Math.max(64, Math.round(Number(r.canvas.height) || d.canvas.height))),
      background: typeof r.canvas.background === "string" && /^(transparent|#[0-9a-fA-F]{3,8})$/.test(r.canvas.background) ? r.canvas.background : "#ffffff",
    };
  }
  if (Array.isArray(r.layers)) {
    d.layers = (r.layers as Partial<EditorLayer>[])
      .filter((l) => l && typeof l === "object" && typeof l.id === "string")
      .slice(0, 200)
      .map((l) => ({
        id: l.id!,
        kind: l.kind === "text" ? "text" : "image",
        src: typeof l.src === "string" ? l.src : "",
        name: typeof l.name === "string" ? l.name.slice(0, 60) : "圖層",
        x: Number(l.x) || 0,
        y: Number(l.y) || 0,
        width: Math.max(1, Number(l.width) || 100),
        height: Math.max(1, Number(l.height) || 100),
        rotation: Number(l.rotation) || 0,
        visible: l.visible !== false,
        ...(l.locked ? { locked: true } : {}),
        ...(typeof l.opacity === "number" ? { opacity: Math.min(1, Math.max(0, l.opacity)) } : {}),
        ...(l.blend && BLEND_MODES.some((b) => b.id === l.blend) ? { blend: l.blend } : {}),
        ...(l.flipX ? { flipX: true } : {}),
        ...(l.flipY ? { flipY: true } : {}),
        ...(l.crop ? { crop: { x: Number(l.crop.x) || 0, y: Number(l.crop.y) || 0, w: Number(l.crop.w) || 1, h: Number(l.crop.h) || 1 } } : {}),
        ...(l.adjust ? { adjust: { ...DEFAULT_ADJUST, ...l.adjust } } : {}),
        ...(l.text ? { text: { ...DEFAULT_TEXT_STYLE, ...l.text } } : {}),
        ...(typeof l.previousSrc === "string" ? { previousSrc: l.previousSrc } : {}),
        ...(l.previousProps && typeof l.previousProps === "object" ? { previousProps: l.previousProps } : {}),
      }));
  }
  return d;
}

/** Rough byte size of a doc as JSON — projects are capped server-side, and data-URL layers are what blow it. */
export function docBytes(doc: EditorDoc): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}
