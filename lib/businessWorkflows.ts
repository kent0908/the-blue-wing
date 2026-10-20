import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { BusinessError } from "./businessTypes";
import { sql } from "./db";
import { validateGraph, validateName } from "./canvas/validation";
import type { CanvasGraph } from "./canvas/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[a-f0-9]{32}$/;
const MAX_BODY_BYTES = 3_100_000;
const MAX_WORKFLOWS = 60;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function fail(code = "workflow_invalid_graph", status = 400): never { throw new BusinessError(code, status); }

export interface BusinessWorkflowItem {
  uploadId: string;
  src: string;
  name: string;
}
interface WorkflowRow {
  id: string; account_id: string; user_id: number | string; name: string; graph: CanvasGraph;
  version: string; created_at: string | Date; updated_at: string | Date;
}
export interface BusinessWorkflow {
  id: string; name: string; graph: CanvasGraph; version: string; createdAt: string; updatedAt: string;
}
const iso = (value: string | Date) => new Date(value).toISOString();
function publicWorkflow(row: WorkflowRow): BusinessWorkflow {
  return { id: row.id, name: row.name, graph: row.graph, version: row.version, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function ownerId(value: number | string): string {
  const normalized = String(value);
  if (!/^[1-9]\d{0,18}$/.test(normalized) || BigInt(normalized) > BigInt("9223372036854775807") ||
    (typeof value === "number" && !Number.isSafeInteger(value))) fail("business_not_approved", 403);
  return normalized;
}
function accountId(value: string): string { if (!UUID.test(value)) fail("business_not_approved", 403); return value; }
export function businessWorkflowId(value: string): string { if (!UUID.test(value)) fail("workflow_invalid_id"); return value; }

/** Unlike the generation JSON reader, graph snapshots have a strictly bounded 3 MB budget. */
export async function readBusinessWorkflowJson(req: NextRequest): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") fail("invalid_body");
  const reader = req.body?.getReader();
  if (!reader) fail("invalid_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); fail("invalid_body", 413); }
      chunks.push(part.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!record(body)) fail("invalid_body");
    return body;
  } catch (error) { throw error instanceof BusinessError ? error : new BusinessError("invalid_body"); }
  finally { reader.releaseLock(); }
}

function privateMediaUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1200 &&
    /^\/api\/business\/(?:media\/[A-Za-z0-9/_.,-]+|provider-assets\/uploads\/[0-9a-f-]+\/preview)$/.test(value) &&
    !value.includes("..") && !value.includes("//");
}
function validateItem(value: unknown): asserts value is BusinessWorkflowItem {
  if (!record(value) || Object.keys(value).some(key => !["uploadId", "src", "name"].includes(key)) ||
    typeof value.name !== "string" || value.name.length > 120 || /[\x00-\x1f\x7f]/.test(value.name) ||
    typeof value.uploadId !== "string" || !UUID.test(value.uploadId) || !privateMediaUrl(value.src)) fail();
}

/** Reuse C's structural/port validation, while replacing only its numeric-asset schema. */
export function validateBusinessWorkflowGraph(value: unknown): CanvasGraph {
  if (!record(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) fail();
  // Check the original snapshot first; projecting loadImage.items must not hide malicious keys.
  const inspect = (item: unknown, depth: number) => {
    if (depth > 32) fail();
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "string") { if (/\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/i.test(item)) fail(); return; }
    if (typeof item === "number") { if (!Number.isFinite(item)) fail(); return; }
    if (Array.isArray(item)) { item.forEach(v => inspect(v, depth + 1)); return; }
    if (!record(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail();
    for (const [key, child] of Object.entries(item)) {
      if (["__proto__", "constructor", "prototype", "assetId", "assetIds", "imageUrls", "refUrls"].includes(key)) fail();
      inspect(child, depth + 1);
    }
  };
  inspect(value, 0);
  let shadow: unknown;
  try {
    shadow = { ...value, nodes: value.nodes.map(node => {
      if (!record(node) || !record(node.data)) fail();
      if (node.data.businessItems !== undefined && node.type !== "loadImage") fail();
      if (node.type === "loadImage") {
        if (!Array.isArray(node.data.items) || node.data.items.length > 0) fail();
        if (node.data.businessItems !== undefined && (!Array.isArray(node.data.businessItems) || node.data.businessItems.length > 50)) fail();
        const unique = new Set<string>();
        for (const item of (node.data.businessItems ?? []) as unknown[]) {
          validateItem(item);
          if (unique.has(item.uploadId)) fail(); unique.add(item.uploadId);
        }
      }
      if (node.data.capturedImage != null && (node.type !== "director3d" || typeof node.data.capturedImage !== "string" ||
        !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(node.data.capturedImage))) fail();
      if (record(node.output)) {
        if (node.output.kind === "image" && Array.isArray(node.output.items)) for (const item of node.output.items) {
          if (!record(item)) fail();
          if (Object.keys(item).some(key => !["url", "businessAssetId", "businessGenerationId"].includes(key))) fail();
          for (const key of ["businessAssetId", "businessGenerationId"]) if (item[key] !== undefined && (typeof item[key] !== "string" || !UUID.test(item[key]))) fail();
          if (item.businessAssetId && item.businessGenerationId) fail();
          if (!privateMediaUrl(item.url) && !(node.type === "director3d" && item.url === node.data.capturedImage) &&
            !(node.type === "loadImage" && Array.isArray(node.data.businessItems) && node.data.businessItems.some(source => record(source) && source.src === item.url))) fail();
        }
        if (node.output.kind === "video" && !privateMediaUrl(node.output.url)) fail();
      }
      return { ...node, data: { ...node.data, ...(node.type === "loadImage" ? { items: [] } : {}), ...(node.data.seconds === -1 ? { seconds: 1 } : {}) } };
    }) };
    validateGraph(shadow);
    if (new TextEncoder().encode(JSON.stringify(value)).length > 3_000_000) fail();
  } catch (error) { throw error instanceof BusinessError ? error : new BusinessError("workflow_invalid_graph"); }
  // A saved cycle cannot ever be executed; fail during save rather than after a paid upstream node.
  const graph = value as unknown as CanvasGraph;
  const pending = new Map(graph.nodes.map(node => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) { pending.set(edge.toNode, pending.get(edge.toNode)! + 1); outgoing.get(edge.fromNode)!.push(edge.toNode); }
  const queue = graph.nodes.filter(node => pending.get(node.id) === 0).map(node => node.id);
  let count = 0;
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]; count++;
    for (const next of outgoing.get(id)!) { pending.set(next, pending.get(next)! - 1); if (pending.get(next) === 0) queue.push(next); }
  }
  if (count !== graph.nodes.length) fail();
  return graph;
}

function workflowName(value: unknown): string {
  if (typeof value === "string" && (/[\x00-\x1f\x7f]/.test(value) || /\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/i.test(value))) fail("workflow_invalid_name");
  try { return validateName(value); } catch { return fail("workflow_invalid_name"); }
}
function fields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) fail("invalid_body");
}

export async function listBusinessWorkflows(userId: number | string, businessAccountId: string) {
  const { rows } = await sql.query<WorkflowRow & { node_count: number }>(`select w.id,w.name,w.version,w.created_at,w.updated_at,
      jsonb_array_length(w.graph->'nodes') as node_count
    from business_canvas_workflows w join business_accounts a on a.id=w.account_id and a.user_id=w.user_id
    where w.user_id=$1 and w.account_id=$2 and a.status='approved' order by w.updated_at desc limit 60`, [ownerId(userId), accountId(businessAccountId)]);
  return rows.map(row => ({ id: row.id, name: row.name, version: row.version, nodeCount: row.node_count, updatedAt: iso(row.updated_at), createdAt: iso(row.created_at) }));
}

export async function getBusinessWorkflow(userId: number | string, businessAccountId: string, id: string): Promise<BusinessWorkflow> {
  const { rows } = await sql.query<WorkflowRow>(`select w.* from business_canvas_workflows w
    join business_accounts a on a.id=w.account_id and a.user_id=w.user_id
    where w.id=$1 and w.user_id=$2 and w.account_id=$3 and a.status='approved' limit 1`, [businessWorkflowId(id), ownerId(userId), accountId(businessAccountId)]);
  if (!rows[0]) fail("workflow_not_found", 404);
  return publicWorkflow(rows[0]);
}

export async function createBusinessWorkflow(userId: number | string, businessAccountId: string, body: Record<string, unknown>): Promise<BusinessWorkflow> {
  fields(body, ["name", "graph"]);
  const name = workflowName(body.name ?? "Untitled workflow"), graph = validateBusinessWorkflowGraph(body.graph ?? { nodes: [], edges: [] });
  const uid = ownerId(userId), aid = accountId(businessAccountId), client = await sql.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("select id from business_accounts where id=$1 and user_id=$2 and status='approved' for update", [aid, uid]);
    if (!account.rows.length) fail("business_not_approved", 403);
    const count = await client.query<{ count: string }>("select count(*) from business_canvas_workflows where account_id=$1 and user_id=$2", [aid, uid]);
    if (Number(count.rows[0]?.count ?? 0) >= MAX_WORKFLOWS) fail("workflow_limit", 429);
    const { rows } = await client.query<WorkflowRow>(`insert into business_canvas_workflows(id,account_id,user_id,name,graph,version)
      values($1,$2,$3,$4,$5::jsonb,$6) returning *`, [randomUUID(), aid, uid, name, JSON.stringify(graph), randomBytes(16).toString("hex")]);
    await client.query("COMMIT");
    return publicWorkflow(rows[0]);
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function saveBusinessWorkflow(userId: number | string, businessAccountId: string, id: string, body: Record<string, unknown>): Promise<BusinessWorkflow> {
  fields(body, ["name", "graph", "version"]);
  if (typeof body.version !== "string" || !VERSION.test(body.version)) fail("workflow_version_required", 428);
  const name = body.name === undefined ? null : workflowName(body.name);
  const graph = body.graph === undefined ? null : validateBusinessWorkflowGraph(body.graph);
  if (name === null && graph === null) fail("invalid_body");
  const uid = ownerId(userId), aid = accountId(businessAccountId), wid = businessWorkflowId(id), client = await sql.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("select id from business_accounts where id=$1 and user_id=$2 and status='approved' for update", [aid, uid]);
    if (!account.rows.length) fail("business_not_approved", 403);
    const { rows } = await client.query<WorkflowRow>(`update business_canvas_workflows set name=coalesce($4,name),graph=coalesce($5::jsonb,graph),version=$6,
      updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond')
      where id=$1 and user_id=$2 and account_id=$3 and version=$7 returning *`, [wid, uid, aid, name, graph === null ? null : JSON.stringify(graph), randomBytes(16).toString("hex"), body.version]);
    if (!rows[0]) {
      const existing = await client.query("select id from business_canvas_workflows where id=$1 and user_id=$2 and account_id=$3", [wid, uid, aid]);
      fail(existing.rows.length ? "workflow_conflict" : "workflow_not_found", existing.rows.length ? 409 : 404);
    }
    await client.query("COMMIT");
    return publicWorkflow(rows[0]);
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
