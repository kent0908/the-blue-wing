/**
 * 藍翼廣場 — 任何使用者都能把自己的畫布分享出來給其他人瀏覽、複製成自己的
 * 畫布。跟 lib/canvasTemplates.ts 是同一套「快照＋複製」機制，差別只在誰
 * 能發布（這裡是任何人，官方模板只有 admin）跟多一個 status 讓 admin 可以
 * 下架不當內容。已知限制（loadImage 節點的私人素材參考複製後會失效）跟
 * canvasTemplates.ts 相同，理由見那邊的說明，這裡不重複。
 */
import { sql } from "./db";
import type { CanvasGraph } from "./canvas/types";

export interface CanvasPlazaRow {
  id: number;
  user_id: number;
  name: string;
  description: string;
  graph: CanvasGraph;
  status: "visible" | "hidden";
  copy_count: number;
  created_at: string;
  updated_at: string;
}

export interface PublicPlazaPost {
  id: number;
  name: string;
  description: string;
  nodeCount: number;
  copyCount: number;
  authorName: string;
  isOwn: boolean;
  createdAt: string;
}

export function toPublicPlazaPost(r: CanvasPlazaRow, authorName: string, viewerId: number): PublicPlazaPost {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    nodeCount: Array.isArray(r.graph?.nodes) ? r.graph.nodes.length : 0,
    copyCount: r.copy_count,
    authorName,
    isOwn: r.user_id === viewerId,
    createdAt: r.created_at,
  };
}

/** Visible posts, newest first, joined with the author's display name (email
 *  local-part — this app has no separate display-name field on users). */
export async function listVisiblePlazaPosts(): Promise<{ row: CanvasPlazaRow; authorName: string }[]> {
  const { rows } = await sql<CanvasPlazaRow & { author_email: string }>`
    select p.id, p.user_id, p.name, p.description, p.graph, p.status, p.copy_count, p.created_at, p.updated_at,
           u.email as author_email
    from canvas_plaza_posts p
    join users u on u.id = p.user_id
    where p.status = 'visible'
    order by p.created_at desc
    limit 120
  `;
  return rows.map((r) => ({ row: r, authorName: r.author_email.split("@")[0] }));
}

export async function getPlazaPost(id: number): Promise<CanvasPlazaRow | null> {
  const { rows } = await sql<CanvasPlazaRow>`
    select id, user_id, name, description, graph, status, copy_count, created_at, updated_at
    from canvas_plaza_posts where id = ${id}
  `;
  return rows[0] ?? null;
}

export async function createPlazaPost(input: {
  userId: number;
  name: string;
  description: string;
  graph: CanvasGraph;
}): Promise<CanvasPlazaRow> {
  const { rows } = await sql<CanvasPlazaRow>`
    insert into canvas_plaza_posts (user_id, name, description, graph)
    values (${input.userId}, ${input.name}, ${input.description}, ${JSON.stringify(input.graph)}::jsonb)
    returning id, user_id, name, description, graph, status, copy_count, created_at, updated_at
  `;
  return rows[0];
}

export async function incrementCopyCount(id: number): Promise<void> {
  await sql`update canvas_plaza_posts set copy_count = copy_count + 1 where id = ${id}`;
}

/** Author (own post) or admin — both allowed to delete/hide. Caller checks role. */
export async function deletePlazaPost(id: number): Promise<boolean> {
  const { rowCount } = await sql`delete from canvas_plaza_posts where id = ${id}`;
  return (rowCount ?? 0) > 0;
}

export async function setPlazaPostStatus(id: number, status: "visible" | "hidden"): Promise<boolean> {
  const { rowCount } = await sql`update canvas_plaza_posts set status = ${status}, updated_at = now() where id = ${id}`;
  return (rowCount ?? 0) > 0;
}
