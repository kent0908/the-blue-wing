/**
 * 智慧畫布「官方模板」— admin 把自己畫布目前的 graph 拍一份快照發布出來，
 * 所有使用者都能瀏覽、一鍵複製成自己的畫布（app/api/canvas 現有的
 * POST /api/canvas 已經支援用一份 graph 直接建立新畫布，複製就是照這條路
 * 走一次，不用另外重寫建立邏輯）。
 *
 * 快照設計：發布之後 admin 繼續編輯自己原本的畫布，或刪掉那份畫布，都不會
 * 影響已發布的範本；範本本身被刪除，也不影響任何已經複製走的使用者副本
 * （複製出去的那份本來就是獨立的 canvas_workflows 列）。
 *
 * 已知限制：如果被快照的 graph 裡有 loadImage 節點帶著 assetId（引用
 * admin 自己私人素材庫的圖片），複製到別的使用者帳號後，那個 assetId 對
 * 新帳號來說不是自己的東西，圖片就讀不到（資產庫的擁有權檢查會直接跳過非
 * 本人資產，不會噴錯，就是那個節點的參考圖悄悄變空）。範本的價值在於節點
 * 結構/prompt 本身，不是原作者用的素材圖，這個限制先接受，不做額外的
 * 素材重新託管機制。
 */
import { sql } from "./db";
import type { CanvasGraph } from "./canvas/types";

export interface CanvasTemplateRow {
  id: number;
  name: string;
  description: string;
  graph: CanvasGraph;
  created_by: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PublicCanvasTemplate {
  id: number;
  name: string;
  description: string;
  nodeCount: number;
  createdAt: string;
}

export function toPublicTemplate(r: CanvasTemplateRow): PublicCanvasTemplate {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    nodeCount: Array.isArray(r.graph?.nodes) ? r.graph.nodes.length : 0,
    createdAt: r.created_at,
  };
}

export async function listTemplates(): Promise<CanvasTemplateRow[]> {
  const { rows } = await sql<CanvasTemplateRow>`
    select id, name, description, graph, created_by, sort_order, created_at, updated_at
    from canvas_templates
    order by sort_order asc, created_at desc
  `;
  return rows;
}

export async function getTemplate(id: number): Promise<CanvasTemplateRow | null> {
  const { rows } = await sql<CanvasTemplateRow>`
    select id, name, description, graph, created_by, sort_order, created_at, updated_at
    from canvas_templates where id = ${id}
  `;
  return rows[0] ?? null;
}

export async function createTemplate(input: {
  name: string;
  description: string;
  graph: CanvasGraph;
  createdBy: number;
}): Promise<CanvasTemplateRow> {
  const { rows } = await sql<CanvasTemplateRow>`
    insert into canvas_templates (name, description, graph, created_by)
    values (${input.name}, ${input.description}, ${JSON.stringify(input.graph)}::jsonb, ${input.createdBy})
    returning id, name, description, graph, created_by, sort_order, created_at, updated_at
  `;
  return rows[0];
}

export async function deleteTemplate(id: number): Promise<boolean> {
  const { rowCount } = await sql`delete from canvas_templates where id = ${id}`;
  return (rowCount ?? 0) > 0;
}
