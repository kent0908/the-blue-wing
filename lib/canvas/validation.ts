import { NODE_SPECS, type CanvasGraph, type CanvasNodeType } from "./types";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function fail(message: string): never { throw new Error(`畫布資料不正確：${message}`); }
function finite(value: unknown) { return typeof value === "number" && Number.isFinite(value); }
export function parseWorkflowId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
export function validateName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) fail("名稱需為 1 至 120 字");
  return value.trim();
}
function normalizeReference(item: unknown): unknown {
  if (!object(item) || typeof item.assetId !== "string" || !/^[1-9]\d*$/.test(item.assetId)) return item;
  const id = Number(item.assetId);
  return Number.isSafeInteger(id) ? { ...item, assetId: id } : item;
}
export function validateGraph(value: unknown): CanvasGraph {
  // PostgreSQL bigint IDs can arrive as strings, including in older saved drafts.
  if (object(value) && Array.isArray(value.nodes)) value = { ...value, nodes: value.nodes.map(n => {
    if (!object(n)) return n;
    return { ...n,
      ...(object(n.data) && Array.isArray(n.data.items) ? { data: { ...n.data, items: n.data.items.map(normalizeReference) } } : {}),
      ...(object(n.output) && Array.isArray(n.output.items) ? { output: { ...n.output, items: n.output.items.map(normalizeReference) } } : {})
    };
  }) };

  if (!object(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) fail("需包含 nodes 與 edges 陣列");
  if (value.nodes.length > 200 || value.edges.length > 1000) fail("節點或連線數量超過上限");
  // Bound nested scene data and reject non-JSON values before persistence.
  const walk = (v: unknown, depth: number) => {
    if (depth > 32) fail("巢狀層數過多");
    if (typeof v === "number" && !Number.isFinite(v)) fail("數值必須有限");
    if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number") return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
    if (!object(v)) fail("包含不支援的資料");
    for (const [key, item] of Object.entries(v)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) fail("不合法欄位");
      walk(item, depth + 1);
    }
  };
  walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 3_000_000) fail("資料超過 3 MB，請減少素材或拆分畫布");
  const nodes = new Map<string, Record<string, unknown>>();
  for (const node of value.nodes) {
    if (!object(node) || typeof node.id !== "string" || !node.id || node.id.length > 128 || nodes.has(node.id)) fail("節點 ID 必須唯一");
    if (typeof node.type !== "string" || !Object.hasOwn(NODE_SPECS, node.type)) fail("未知節點種類");
    if (!finite(node.x) || !finite(node.y) || !object(node.data)) fail("節點座標或內容不合法");
    for (const key of ["width", "textHeight"]) if (node[key] !== undefined && (!finite(node[key]) || Number(node[key]) <= 0)) fail("節點尺寸不合法");
    for (const key of ["text", "prompt", "model", "size", "resolution", "capturedImage"]) {
      if (node.data[key] !== undefined && node.data[key] !== null && typeof node.data[key] !== "string") fail(`${key} 必須是文字`);
    }
    if (node.data.seconds !== undefined && (!finite(node.data.seconds) || Number(node.data.seconds) <= 0)) fail("影片長度不合法");
    if (node.type === "loadImage") {
      if (!Array.isArray(node.data.items)) fail("素材需為陣列");
      for (const item of node.data.items) if (!object(item) || !Number.isSafeInteger(item.assetId) || Number(item.assetId) <= 0 || typeof item.src !== "string" || typeof item.name !== "string") fail("素材參照不合法");
    }
    if (node.type === "director3d" && (!Array.isArray(node.data.characters) || !object(node.data.ground) || !object(node.data.background))) fail("3D 場景結構不完整");
    if (node.status !== undefined && !["idle", "running", "done", "error"].includes(String(node.status))) fail("執行狀態不合法");
    if (node.error !== undefined && node.error !== null && typeof node.error !== "string") fail("錯誤訊息不合法");
    if (node.output != null) {
      const out = node.output;
      if (!object(out) || out.kind !== NODE_SPECS[node.type as CanvasNodeType].output.type) fail("輸出種類與節點不符");
      if (out.kind === "text" && typeof out.text !== "string") fail("文字輸出不合法");
      if (out.kind === "video" && typeof out.url !== "string") fail("影片輸出不合法");
      if (out.kind === "image") {
        if (!Array.isArray(out.items)) fail("圖片輸出不合法");
        for (const item of out.items) if (!object(item) || typeof item.url !== "string" || (item.assetId !== undefined && (!Number.isSafeInteger(item.assetId) || Number(item.assetId) <= 0))) fail("圖片參照不合法");
      }
    }
    nodes.set(node.id, node);
  }
  const ids = new Set<string>(); const inputs = new Set<string>();
  for (const edge of value.edges) {
    if (!object(edge) || typeof edge.id !== "string" || !edge.id || ids.has(edge.id)) fail("連線 ID 必須唯一");
    const from = nodes.get(String(edge.fromNode)); const to = nodes.get(String(edge.toNode));
    if (!from || !to || from === to) fail("連線節點不存在或自我連接");
    const source = NODE_SPECS[from.type as CanvasNodeType].output;
    const target = NODE_SPECS[to.type as CanvasNodeType].inputs.find(p => p.id === edge.toPort);
    if (edge.fromPort !== source.id || !target || source.type !== target.type) fail("連接埠或資料種類不符");
    const key = JSON.stringify([edge.toNode, edge.toPort]);
    if (inputs.has(key)) fail("同一輸入埠只能有一條連線");
    inputs.add(key); ids.add(edge.id);
  }
  return value as unknown as CanvasGraph;
}
