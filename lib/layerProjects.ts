import { sql } from "./db";
import { SirayaApiError } from "./siraya";

/**
 * 圖層編輯 project storage (see layer_projects / layer_project_versions in
 * scripts/schema.sql). Per-account like everything else here: every query
 * scopes by user_id. Documents are the client's EditorDoc (lib/layerEditor.ts)
 * stored as-is after a shape check — the client normalises on load
 * (normalizeDoc), so the server only guards against garbage and size.
 *
 * Size: image layers reference asset (/api/assets/:id/raw) or generated-media
 * URLs, never inline bytes; the only data-URL layer is the small 標記
 * overlay, so 2MB is generous. The cap exists because a doc that DOES carry
 * inline images (e.g. an upload that couldn't reach 資產庫) would otherwise
 * grow without bound.
 */
export const MAX_PROJECT_DOC_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECTS_PER_USER = 200;
export const MAX_VERSIONS_PER_PROJECT = 60;

export interface LayerProjectRow {
  id: number;
  user_id: number;
  name: string;
  doc: unknown;
  created_at: string;
  updated_at: string;
}

export interface LayerProjectSummary {
  id: number;
  name: string;
  layerCount: number;
  canvas: { width: number; height: number } | null;
  createdAt: string;
  updatedAt: string;
}

export function summarize(row: LayerProjectRow): LayerProjectSummary {
  const doc = (row.doc ?? {}) as { canvas?: { width?: number; height?: number }; layers?: unknown[] };
  return {
    id: Number(row.id),
    name: row.name,
    layerCount: Array.isArray(doc.layers) ? doc.layers.length : 0,
    canvas: doc.canvas && typeof doc.canvas.width === "number" && typeof doc.canvas.height === "number" ? { width: doc.canvas.width, height: doc.canvas.height } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Shape + size gate for a document coming from the client. Throws a 400 SirayaApiError (errorResponse maps it). */
export function assertDoc(doc: unknown): asserts doc is { canvas: object; layers: unknown[] } {
  const d = doc as { canvas?: unknown; layers?: unknown } | null;
  if (!d || typeof d !== "object" || !d.canvas || typeof d.canvas !== "object" || !Array.isArray(d.layers)) throw new SirayaApiError(400, "專案資料格式不正確", "invalid_request_error", "bad_doc");
  if (d.layers.length > 200) throw new SirayaApiError(400, "圖層數量超過上限（200）", "invalid_request_error", "bad_doc");
  if (JSON.stringify(doc).length > MAX_PROJECT_DOC_BYTES) throw new SirayaApiError(400, `專案資料超過 ${MAX_PROJECT_DOC_BYTES / 1024 / 1024} MB — 圖片請先存進資產庫再加入，不要直接貼入`, "invalid_request_error", "too_large");
}

export function cleanName(value: unknown, fallback = "未命名專案"): string {
  const s = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return s || fallback;
}

export async function listProjects(userId: number): Promise<LayerProjectSummary[]> {
  const { rows } = await sql<LayerProjectRow>`
    select id, user_id, name, doc, created_at, updated_at from layer_projects
    where user_id = ${userId} order by updated_at desc limit ${MAX_PROJECTS_PER_USER}
  `;
  return rows.map(summarize);
}

export async function createProject(userId: number, name: string, doc: unknown): Promise<LayerProjectRow> {
  const { rows: count } = await sql<{ n: number }>`select count(*)::int as n from layer_projects where user_id = ${userId}`;
  if ((count[0]?.n ?? 0) >= MAX_PROJECTS_PER_USER) throw new SirayaApiError(400, `專案數量已達上限（${MAX_PROJECTS_PER_USER}），請先刪除一些`, "invalid_request_error", "too_many");
  const { rows } = await sql<LayerProjectRow>`
    insert into layer_projects (user_id, name, doc) values (${userId}, ${name}, ${JSON.stringify(doc)}::jsonb)
    returning id, user_id, name, doc, created_at, updated_at
  `;
  return rows[0];
}

export async function getProject(userId: number, id: number): Promise<LayerProjectRow | null> {
  const { rows } = await sql<LayerProjectRow>`
    select id, user_id, name, doc, created_at, updated_at from layer_projects where id = ${id} and user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

export async function updateProject(userId: number, id: number, patch: { name?: string; doc?: unknown }): Promise<LayerProjectRow | null> {
  const { rows } = await sql<LayerProjectRow>`
    update layer_projects set
      name = coalesce(${patch.name ?? null}, name),
      doc = coalesce(${patch.doc === undefined ? null : JSON.stringify(patch.doc)}::jsonb, doc),
      updated_at = now()
    where id = ${id} and user_id = ${userId}
    returning id, user_id, name, doc, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function deleteProject(userId: number, id: number): Promise<boolean> {
  const { rowCount } = await sql`delete from layer_projects where id = ${id} and user_id = ${userId}`;
  return (rowCount ?? 0) > 0;
}

export interface VersionRow {
  id: number;
  project_id: number;
  label: string;
  doc: unknown;
  created_at: string;
}

export async function listVersions(userId: number, projectId: number): Promise<{ id: number; label: string; layerCount: number; createdAt: string }[]> {
  const { rows } = await sql<VersionRow>`
    select v.id, v.project_id, v.label, v.doc, v.created_at from layer_project_versions v
    join layer_projects p on p.id = v.project_id
    where v.project_id = ${projectId} and p.user_id = ${userId}
    order by v.created_at desc limit ${MAX_VERSIONS_PER_PROJECT}
  `;
  return rows.map((v) => ({ id: Number(v.id), label: v.label, layerCount: Array.isArray((v.doc as { layers?: unknown[] })?.layers) ? (v.doc as { layers: unknown[] }).layers.length : 0, createdAt: v.created_at }));
}

/** Snapshots the given doc as a version; keeps only the newest MAX_VERSIONS_PER_PROJECT. */
export async function addVersion(userId: number, projectId: number, label: string, doc: unknown): Promise<{ id: number } | null> {
  const owned = await getProject(userId, projectId);
  if (!owned) return null;
  const { rows } = await sql<{ id: number }>`
    insert into layer_project_versions (project_id, label, doc) values (${projectId}, ${label.slice(0, 80)}, ${JSON.stringify(doc)}::jsonb) returning id
  `;
  await sql`
    delete from layer_project_versions where project_id = ${projectId} and id not in (
      select id from layer_project_versions where project_id = ${projectId} order by created_at desc limit ${MAX_VERSIONS_PER_PROJECT}
    )
  `;
  return { id: Number(rows[0].id) };
}

export async function getVersion(userId: number, projectId: number, versionId: number): Promise<VersionRow | null> {
  const { rows } = await sql<VersionRow>`
    select v.id, v.project_id, v.label, v.doc, v.created_at from layer_project_versions v
    join layer_projects p on p.id = v.project_id
    where v.id = ${versionId} and v.project_id = ${projectId} and p.user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}
