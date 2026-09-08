import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { parseWorkflowId, validateGraph, validateName } from "@/lib/canvas/validation";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badId() {
  return NextResponse.json({ error: { message: "無效的畫布 id", code: "bad_id" } }, { status: 400 });
}

/** GET /api/canvas/:id — one workflow, must belong to the caller. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const workflowId = parseWorkflowId(id);
  if (workflowId === null) return badId();

  const { rows } = await sql`
    select id, name, graph, updated_at, created_at, md5(xmin::text || ':' || updated_at::text) as version
    from canvas_workflows
    where id = ${workflowId} and user_id = ${auth.user.id}
    limit 1
  `;
  const r = rows[0];
  if (!r) return NextResponse.json({ error: { message: "找不到這個畫布", code: "not_found" } }, { status: 404 });
  return NextResponse.json({
    workflow: { version: r.version, id: String(r.id), name: r.name, graph: r.graph, updatedAt: r.updated_at, createdAt: r.created_at },
  });
}

/** PUT /api/canvas/:id — save name/graph. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const workflowId = parseWorkflowId(id);
  if (workflowId === null) return badId();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: { message: "請提供合法 JSON 物件" } }, { status: 400 });
  if (typeof body.version !== "string" || ! /^[a-f0-9]{32}$/.test(body.version)) {
    return NextResponse.json({ error: { message: "此頁版本過舊，請先匯出草稿再重新載入", code: "version_required" } }, { status: 428 });
  }
  let name = null, graph = null;
  try {
    if (body.name !== undefined) name = validateName(body.name);
    if (body.graph !== undefined) graph = validateGraph(body.graph);
    if (name === null && graph === null) throw new Error("沒有可更新的內容");
  } catch (e) { return NextResponse.json({ error: { message: e instanceof Error ? e.message : "資料不正確" } }, { status: 400 }); }


  const { rows } = await sql`
    update canvas_workflows set
      name = coalesce(${name}, name),
      graph = coalesce(${graph ? JSON.stringify(graph) : null}::jsonb, graph),
      updated_at = now()
    where id = ${workflowId} and user_id = ${auth.user.id} and md5(xmin::text || ':' || updated_at::text) = ${body.version}
    returning id, name, graph, updated_at, created_at, md5(xmin::text || ':' || updated_at::text) as version
  `;
  const r = rows[0];
  if (!r) {
    const existing = await sql`select id from canvas_workflows where id = ${workflowId} and user_id = ${auth.user.id}`;
    return NextResponse.json({ error: { message: existing.rows.length ? "另一個分頁已更新此畫布。你的草稿仍保留，請先匯出再重新載入比較。" : "找不到這個畫布", code: existing.rows.length ? "conflict" : "not_found" } }, { status: existing.rows.length ? 409 : 404 });
  }
  return NextResponse.json({
    workflow: { version: r.version, id: String(r.id), name: r.name, graph: r.graph, updatedAt: r.updated_at, createdAt: r.created_at },
  });
}

/** DELETE /api/canvas/:id */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const workflowId = parseWorkflowId(id);
  if (workflowId === null) return badId();

  const { rowCount } = await sql`
    delete from canvas_workflows where id = ${workflowId} and user_id = ${auth.user.id}
  `;
  if (!rowCount) return NextResponse.json({ error: { message: "找不到這個畫布", code: "not_found" } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
