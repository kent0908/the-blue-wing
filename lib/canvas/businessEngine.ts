import type { BusinessModel, BusinessGeneration } from "@/components/business/types";
import type { BusinessWorkflowsCopy } from "@/lib/i18n/businessWorkflows";
import type { BusinessCanvasImageItem, CanvasNode, NodeOutput } from "./types";

type Fetcher = typeof fetch;
interface RunnerOptions {
  models: BusinessModel[];
  copy: BusinessWorkflowsCopy;
  fetcher?: Fetcher;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  capture?: (data: string, signal?: AbortSignal) => Promise<{ uploadId: string; src: string }>;
  onJob?: (job: BusinessGeneration) => void;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
  const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  signal?.addEventListener("abort", abort, { once: true });
});

/** Only opaque business source IDs cross the generation boundary; display URLs never do. */
export function createBusinessCanvasRunner(options: RunnerOptions) {
  const request = options.fetcher ?? fetch;
  const wait = options.wait ?? delay;
  const t = options.copy;
  return async (node: CanvasNode, inputs: Record<string, CanvasNode | undefined>, signal?: AbortSignal): Promise<NodeOutput> => {
    signal?.throwIfAborted();
    if (node.type === "text") return { kind: "text", text: String(node.data.text ?? "") };
    if (node.type === "loadImage") {
      const items = node.data.businessItems as BusinessCanvasImageItem[] | undefined;
      if (!Array.isArray(items) || !items.length || items.some(item => !item || !UUID.test(item.uploadId))) throw new Error(t.originalRequired);
      return { kind: "image", items: items.map(item => ({ url: `/api/business/provider-assets/uploads/${item.uploadId}/preview`, businessAssetId: item.uploadId })) };
    }
    if (node.type === "director3d") {
      const captured = node.data.capturedImage;
      if (typeof captured !== "string" || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(captured) || captured.length > 2_800_000 || !options.capture) throw new Error(t.missingCapture);
      const original = await options.capture(captured, signal);
      if (!UUID.test(original.uploadId)) throw new Error(t.captureUploadFailed);
      return { kind: "image", items: [{ url: original.src, businessAssetId: original.uploadId }] };
    }
    const model = options.models.find(model => model.id === node.data.model && model.modality === node.type);
    if (!model) throw new Error(t.unavailableModel);
    const upstreamText = inputs.prompt?.output;
    const prompt = (upstreamText?.kind === "text" ? upstreamText.text : "") || String(node.data.prompt ?? "");
    if (!prompt.trim()) throw new Error(t.missingPrompt);
    const upstream = inputs.image?.output;
    const sources = upstream?.kind === "image" ? upstream.items : [];
    if (sources.some(item => (item.businessAssetId && item.businessGenerationId) || (!item.businessAssetId && !item.businessGenerationId) || (item.businessAssetId && !UUID.test(item.businessAssetId)) || (item.businessGenerationId && !UUID.test(item.businessGenerationId)))) throw new Error(t.invalidReference);
    const sourceKeys = sources.map(item => item.businessAssetId ? `business:${item.businessAssetId}` : `generated:${item.businessGenerationId}`);
    if (new Set(sourceKeys).size !== sourceKeys.length) throw new Error(t.invalidReference);
    if (sources.length && node.type === "video" && !model.seedance && !model.dedicatedVideo) throw new Error(t.invalidReference);
    const businessAssetIds = [...new Set(sources.flatMap(item => item.businessAssetId ? [item.businessAssetId] : []))];
    const referenceGenerationIds = [...new Set(sources.flatMap(item => item.businessGenerationId ? [item.businessGenerationId] : []))];
    if (sources.length && !model.supportsReferences) throw new Error(t.invalidReference);
    const parameters: Record<string, unknown> = { model: model.id, prompt };
    if (businessAssetIds.length) parameters.businessAssetIds = businessAssetIds;
    if (referenceGenerationIds.length) parameters.referenceGenerationIds = referenceGenerationIds;
    if (node.type === "image") {
      parameters.n = 1;
      parameters.size = model.sizes?.includes(String(node.data.size)) ? node.data.size : model.sizes?.[0];
      if (node.data.quality && model.imageControls?.some(control => control.key === "quality" && control.options?.includes(String(node.data.quality)))) parameters.quality = node.data.quality;
    } else {
      const seconds = Number(node.data.seconds);
      parameters.seconds = model.secondsOptions?.includes(seconds) ? seconds : model.secondsOptions?.[0] ?? Math.max(model.minSeconds ?? 2, Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds : model.defaultSeconds ?? 5, model.maxSeconds ?? 15));
      parameters.resolution = model.resolutions?.includes(String(node.data.resolution)) ? node.data.resolution : model.resolutions?.[0];
      parameters.aspect_ratio = model.aspectRatios?.includes(String(node.data.aspect_ratio)) ? node.data.aspect_ratio : model.aspectRatios?.includes("16:9") ? "16:9" : model.aspectRatios?.[0];
      if (model.supportsAudio) parameters.generate_audio = model.nativeAudioOnly || node.data.generate_audio === true;
      if (model.seedance) {
        parameters.mode = String(node.data.mode || "freestyle");
        parameters.referenceOrder = sourceKeys;
      }
    }
    // Never retry a POST: an interrupted response may still have created a paid job.
    const response = await request("/api/business/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), kind: node.type, parameters }), signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message ?? t.failed);
    let job = body?.generation as BusinessGeneration | undefined;
    if (!job || !UUID.test(job.id)) throw new Error(t.uncertain);
    options.onJob?.(job);
    const jobId = job.id;
    for (let attempt = 0; job && (job.status === "submitting" || job.status === "processing"); attempt++) {
      if (attempt >= 225) throw new Error(`${t.uncertain} (${jobId})`);
      await wait(4000, signal);
      const status = await request(`/api/business/generations/${encodeURIComponent(jobId)}`, { cache: "no-store", signal });
      const result = await status.json().catch(() => null);
      if (!status.ok || result?.generation?.id !== jobId) throw new Error(`${t.uncertain} (${jobId})`);
      job = result.generation;
      options.onJob?.(job!);
    }
    if (!job || job.status === "unknown") throw new Error(`${t.uncertain} (${jobId})`);
    if (job.status !== "completed") throw new Error(`${t.failed} (${jobId})`);
    if (node.type === "image" && job.images?.[0]?.url) return { kind: "image", items: [{ url: job.images[0].url, businessGenerationId: job.id }] };
    if (node.type === "video" && job.videoUrl) return { kind: "video", url: job.videoUrl };
    throw new Error(`${t.noOutput} (${jobId})`);
  };
}
