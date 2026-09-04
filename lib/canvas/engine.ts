/**
 * Canvas execution engine — pure functions, no React. Runs entirely
 * client-side by calling the same /api/images, /api/videos routes the
 * Composer uses, so credits/limits/model catalogues stay in one place.
 */
import type { CanvasGraph, CanvasNode, NodeOutput } from "./types";

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

  if (node.type === "loadImage") {
    const assetId = node.data.assetId;
    const src = node.data.src;
    if (!assetId || !src) throw new Error("請先選擇素材");
    return { kind: "image", url: String(src), assetId: Number(assetId) };
  }

  const promptSrc = inputs.prompt?.output;
  const prompt = (promptSrc?.kind === "text" ? promptSrc.text : "") || String(node.data.prompt ?? "");
  if (!prompt.trim()) throw new Error("缺少 prompt（可以連接文字節點，或直接在節點裡打字）");
  const imageSrc = inputs.image?.output;

  if (node.type === "image") {
    const body: Record<string, unknown> = {
      model: node.data.model,
      prompt,
      n: 1,
      size: node.data.size || "1024x1024",
      response_format: "url",
    };
    if (imageSrc?.kind === "image") {
      if (imageSrc.assetId) body.assetIds = [imageSrc.assetId];
      else body.image = imageSrc.url;
    }
    const res = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || "圖片生成失敗");
    const url = json.images?.[0]?.url;
    if (!url) throw new Error("沒有取得圖片結果");
    return { kind: "image", url };
  }

  if (node.type === "video") {
    const body: Record<string, unknown> = {
      model: node.data.model,
      prompt,
      seconds: Number(node.data.seconds) || 5,
      resolution: node.data.resolution || "480p",
    };
    if (imageSrc?.kind === "image") {
      if (imageSrc.assetId) body.assetIds = [imageSrc.assetId];
      else body.imageUrl = imageSrc.url;
    }
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
