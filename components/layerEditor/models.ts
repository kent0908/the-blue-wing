"use client";

/**
 * Browser-side ML for 圖層編輯 — SIRAYA has no matting or segmentation
 * endpoint, so these run locally with transformers.js (Apache-2.0) on
 * quantized ONNX weights fetched from the Hugging Face Hub the first time
 * they're used and cached by the browser afterwards:
 *
 *   - 去背: Xenova/modnet (Apache-2.0, ~6.6MB) — portrait/subject matting,
 *     returns an alpha matte. Free and unlimited once loaded; no credits.
 *   - 智慧選取: Xenova/slimsam-77-uniform (Apache-2.0, ~14MB) — a slimmed
 *     Segment Anything. One image-embedding pass (seconds) then instant
 *     per-click masks, used by MaskPainter's 點選物件 tool.
 *
 * Everything here is dynamically imported so the ~1MB runtime and its WASM
 * only download when a user actually clicks one of these tools. Never
 * imported from server code — next.config's serverExternalPackages keeps
 * the package out of the SSR bundle too.
 */

type Transformers = typeof import("@huggingface/transformers");

let lib: Promise<Transformers> | null = null;
function transformers(): Promise<Transformers> {
  lib ??= import("@huggingface/transformers").then((m) => {
    m.env.allowLocalModels = false;
    m.env.useBrowserCache = true;
    return m;
  });
  return lib;
}

export type ProgressFn = (message: string, fraction: number | null) => void;

function progressHook(onProgress?: ProgressFn) {
  return (p: { status?: string; file?: string; progress?: number }) => {
    if (!onProgress) return;
    if (p.status === "progress" && typeof p.progress === "number") onProgress(`下載模型 ${p.file ?? ""}`, p.progress / 100);
    else if (p.status === "done") onProgress("模型就緒", 1);
  };
}

/* ---- 去背 ---------------------------------------------------------------- */

let matting: Promise<unknown> | null = null;

/**
 * Removes the background of an image, returning a PNG data URL with alpha.
 * Works on a data URL, blob URL or same-origin URL (the asset proxy).
 */
export async function removeBackground(src: string, onProgress?: ProgressFn): Promise<string> {
  const { pipeline, RawImage } = await transformers();
  onProgress?.("載入去背模型…", null);
  matting ??= pipeline("background-removal", "Xenova/modnet", { progress_callback: progressHook(onProgress) as never, device: "wasm", dtype: "q8" } as never);
  const segmenter = (await matting) as (input: unknown) => Promise<unknown>;
  onProgress?.("計算去背…", null);
  const image = await RawImage.fromURL(src);
  const out = (await segmenter(image)) as { toBlob: (type?: string) => Promise<Blob> } | { toBlob: (type?: string) => Promise<Blob> }[];
  const result = Array.isArray(out) ? out[0] : out;
  // RawImage.toCanvas() hands back an OffscreenCanvas in the browser (no
  // toDataURL) — go through a Blob instead.
  const blob = await result.toBlob("image/png");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("讀取去背結果失敗"));
    r.readAsDataURL(blob);
  });
  onProgress?.("完成", 1);
  return dataUrl;
}

/* ---- 智慧選取 (SAM) ------------------------------------------------------ */

interface SamSession {
  model: { get_image_embeddings: (inputs: unknown) => Promise<{ image_embeddings: unknown; image_positional_embeddings: unknown }>; (inputs: unknown): Promise<{ pred_masks: unknown; iou_scores: { data: Float32Array } }> };
  processor: ((image: unknown, opts?: unknown) => Promise<{ pixel_values: unknown; original_sizes: [number, number][]; reshaped_input_sizes: [number, number][] }>) & {
    post_process_masks: (masks: unknown, original: unknown, reshaped: unknown) => Promise<{ dims: number[]; data: Uint8Array }[]>;
    reshape_input_points: (points: unknown, original: unknown, reshaped: unknown) => unknown;
  };
}

let sam: Promise<SamSession> | null = null;

export interface SmartSelectSession {
  /** image size the masks come back in */
  width: number;
  height: number;
  /** returns a binary mask (width*height, 1 = selected) for a click at image pixel (x, y); `label` 0 = negative click */
  maskAt: (points: { x: number; y: number; label: 0 | 1 }[]) => Promise<Uint8Array>;
}

/**
 * Prepares an image for click-to-select: runs the (slow) image encoder
 * once, then each call to `maskAt` only runs the mask decoder, which is
 * near-instant. Points are in the image's own pixel coordinates.
 */
export async function prepareSmartSelect(src: string, onProgress?: ProgressFn): Promise<SmartSelectSession> {
  const t = await transformers();
  onProgress?.("載入選取模型…", null);
  sam ??= (async () => {
    const modelId = "Xenova/slimsam-77-uniform";
    const model = (await t.SamModel.from_pretrained(modelId, { progress_callback: progressHook(onProgress) as never, device: "wasm", dtype: "q8" } as never)) as unknown as SamSession["model"];
    const processor = (await t.AutoProcessor.from_pretrained(modelId, {} as never)) as unknown as SamSession["processor"];
    return { model, processor };
  })();
  const { model, processor } = await sam;
  onProgress?.("分析影像…", null);
  const image = await t.RawImage.fromURL(src);
  const inputs = await processor(image);
  const embeddings = await model.get_image_embeddings(inputs);
  onProgress?.("完成，點一下要選的物件", 1);
  const [height, width] = inputs.original_sizes[0];
  return {
    width,
    height,
    maskAt: async (points) => {
      const input_points = processor.reshape_input_points([[points.map((p) => [p.x, p.y])]], inputs.original_sizes, inputs.reshaped_input_sizes);
      const input_labels = new t.Tensor("int64", BigInt64Array.from(points.map((p) => BigInt(p.label))), [1, 1, points.length]);
      const outputs = await model({ ...embeddings, input_points, input_labels });
      const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
      // three candidate masks per point set — take the highest IoU score
      const scores = outputs.iou_scores.data;
      let best = 0;
      for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
      const m = masks[0];
      const per = m.dims[2] * m.dims[3];
      return m.data.slice(best * per, (best + 1) * per);
    },
  };
}
