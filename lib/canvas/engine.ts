/**
 * Canvas execution engine — pure functions, no React. Runs entirely
 * client-side by calling the same /api/images, /api/videos routes the
 * Composer uses, so credits/limits/model catalogues stay in one place.
 */
import type { CanvasGraph, CanvasNode, LoadImageItem, NodeOutput } from "./types";
import { sizeOptionsFor } from "@/lib/imageModels";
import { videoConstraintFor } from "@/lib/videoModels";

/** Kahn's algorithm. Returns null if the graph has a cycle. */
export function topoOrder(graph: CanvasGraph): string[] | null {
  const indeg = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    if (!adj.has(e.fromNode) || !indeg.has(e.toNode)) continue;
    adj.get(e.fromNode)!.push(e.toNode);
    indeg.set(e.toNode, (indeg.get(e.toNode) ?? 0) + 1);
  }
  const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  return order.length === graph.nodes.length ? order : null;
}

/** All node ids that must run before (and including) `nodeId`, in run order. */
export function upstreamOrder(graph: CanvasGraph, nodeId: string): string[] {
  const need = new Set<string>();
  const visit = (id: string) => {
    if (need.has(id)) return;
    need.add(id);
    for (const e of graph.edges) if (e.toNode === id) visit(e.fromNode);
  };
  visit(nodeId);
  const order = topoOrder(graph);
  if (!order) return [];
  return order.filter((id) => need.has(id));
}

/** For a node, which upstream node feeds each of its input ports (by port id). */
export function inputsFor(graph: CanvasGraph, nodeId: string): Record<string, CanvasNode | undefined> {
  const map: Record<string, CanvasNode | undefined> = {};
  for (const e of graph.edges) {
    if (e.toNode !== nodeId) continue;
    map[e.toPort] = graph.nodes.find((n) => n.id === e.fromNode);
  }
  return map;
}

async function pollVideoUrl(id: string, ctx: { model: string; prompt: string }): Promise<string> {
  const qs = new URLSearchParams({ model: ctx.model, prompt: ctx.prompt });
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`/api/videos/${encodeURIComponent(id)}?${qs.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || "查詢影片狀態失敗");
    if (json.status === "completed" && json.url) return json.url;
    if (json.status === "failed") throw new Error("影片生成失敗");
  }
  throw new Error("影片生成逾時，請稍後到生成紀錄查看");
}

/** Runs one node given its already-computed upstream inputs. Throws on failure. */
export async function runNode(
  node: CanvasNode,
  inputs: Record<string, CanvasNode | undefined>
): Promise<NodeOutput> {
  if (node.type === "text") {
    return { kind: "text", text: String(node.data.text ?? "") };
  }

  if (node.type === "director3d") {
    const captured = node.data.capturedImage as string | null | undefined;
    if (!captured) throw new Error("請先開啟 3D 導演台，擺好姿勢並截圖");
    return { kind: "image", items: [{ url: captured }] };
  }

  if (node.type === "loadImage") {
    const items = (node.data.items as LoadImageItem[] | undefined) ?? [];
    if (!items.length) throw new Error("請先選擇素材");
    return { kind: "image", items: items.map((it) => ({ url: it.src, assetId: it.assetId })) };
  }

  const promptSrc = inputs.prompt?.output;
  const prompt = (promptSrc?.kind === "text" ? promptSrc.text : "") || String(node.data.prompt ?? "");
  if (!prompt.trim()) throw new Error("缺少 prompt（可以連接文字節點，或直接在節點裡打字）");
  const imageSrc = inputs.image?.output;
  // A connected "image" input can carry several references at once (a Load
  // Image node with multiple items selected, or several Load Image nodes
  // fanned into the same port). Split into asset-library ids (resolved
  // server-side from the private blob store) vs. plain URLs (a prior node's
  // own generated-image output) — the server accepts both together.
  const refAssetIds = imageSrc?.kind === "image" ? imageSrc.items.filter((it) => it.assetId).map((it) => it.assetId!) : [];
  const refUrls = imageSrc?.kind === "image" ? imageSrc.items.filter((it) => !it.assetId).map((it) => it.url) : [];

  if (node.type === "image") {
    // Defensive clamp, not just the node's own size <select> (see
    // CanvasEditor.tsx) — a canvas saved before the 2026-09-07
    // data-accuracy audit can still have a size left over from switching
    // models (or from before per-model options existed at all) that isn't
    // actually valid for whichever model this node is set to now.
    const validSizes = sizeOptionsFor(String(node.data.model ?? ""));
    const requestedSize = String(node.data.size || "1024x1024");
    const body: Record<string, unknown> = {
      model: node.data.model,
      prompt,
      n: 1,
      size: validSizes.includes(requestedSize) ? requestedSize : validSizes[0],
      response_format: "url",
    };
    if (refAssetIds.length) body.assetIds = refAssetIds;
    if (refUrls.length) body.image = refUrls;
    const res = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || "圖片生成失敗");
    const url = json.images?.[0]?.url;
    if (!url) throw new Error("沒有取得圖片結果");
    return { kind: "image", items: [{ url }] };
  }

  if (node.type === "video") {
    // Same defensive clamp as the image branch above, and as
    // lib/jobsStore.tsx's video submission — a per-model real constraint
    // (lib/videoModels.ts's videoConstraintFor), not whatever this node's
    // own fields happen to hold.
    const constraint = videoConstraintFor(String(node.data.model ?? ""));
    const requestedResolution = String(node.data.resolution || "480p");
    const body: Record<string, unknown> = {
      model: node.data.model,
      prompt,
      seconds: Math.min(Number(node.data.seconds) || 5, constraint.maxSeconds),
      resolution: constraint.resolutions.includes(requestedResolution) ? requestedResolution : constraint.resolutions[0],
    };
    if (refAssetIds.length) body.assetIds = refAssetIds;
    if (refUrls.length) body.imageUrls = refUrls;
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || "影片生成請求失敗");
    let url = json.url as string | undefined;
    if (!url && json.id) url = await pollVideoUrl(json.id, { model: String(node.data.model), prompt });
    if (!url) throw new Error("沒有取得影片結果");
    return { kind: "video", url };
  }

  throw new Error("未知節點類型");
}

/** Execute against a fixed snapshot; publish results only for that snapshot. */
export async function executeGraph(graph: CanvasGraph, order: string[], publish: (id: string, patch: Partial<CanvasNode>) => void, signal?: AbortSignal, runner = runNode): Promise<void> {
  for (const id of order) {
    if (signal?.aborted) return;
    const node = graph.nodes.find(n => n.id === id);
    if (!node) continue;
    publish(id, { status: "running", output: null, error: null });
    try {
      const output = await runner(node, inputsFor(graph, id));
      if (signal?.aborted) return;
      node.output = output; node.status = "done";
      publish(id, { status: "done", output, error: null });
    } catch (e) {
      if (signal?.aborted) return;
      publish(id, { status: "error", output: null, error: e instanceof Error ? e.message : "執行失敗" });
      throw e;
    }
  }
}
