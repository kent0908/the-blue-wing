import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
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
  const workflowId = parseInt(id, 10);
  if (!Number.isInteger(workflowId)) return badId();

  const { rows } = await sql`
    select id, name, graph, updated_at, created_at
    from canvas_workflows
    where id = ${workflowId} and user_id = ${auth.user.id}
    limit 1
  `;
  const r = rows[0];
  if (!r) return NextResponse.json({ error: { message: "找不到這個畫布", code: "not_found" } }, { status: 404 });
  return NextResponse.json({
    workflow: { id: String(r.id), name: r.name, graph: r.graph, updatedAt: r.updated_at, createdAt: r.created_at },
  });
}

/** PUT /api/canvas/:id — save name/graph. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const workflowId = parseInt(id, 10);
  if (!Number.isInteger(workflowId)) return badId();

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : null;
  const graph = body?.graph && typeof body.graph === "object" ? body.graph : null;
  if (name === null && graph === null) {
    return NextResponse.json({ error: { message: "沒有可更新的內容" } }, { status: 400 });
  }

  const { rows } = await sql`
    update canvas_workflows set
      name = coalesce(${name}, name),
      graph = coalesce(${graph ? JSON.stringify(graph) : null}::jsonb, graph),
      updated_at = now()
    where id = ${workflowId} and user_id = ${auth.user.id}
    returning id, name, graph, updated_at, created_at
  `;
  const r = rows[0];
  if (!r) return NextResponse.json({ error: { message: "找不到這個畫布", code: "not_found" } }, { status: 404 });
  return NextResponse.json({
    workflow: { id: String(r.id), name: r.name, graph: r.graph, updatedAt: r.updated_at, createdAt: r.created_at },
  });
}

/** DELETE /api/canvas/:id */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const workflowId = parseInt(id, 10);
  if (!Number.isInteger(workflowId)) return badId();

  const { rowCount } = await sql`
    delete from canvas_workflows where id = ${workflowId} and user_id = ${auth.user.id}
  `;
  if (!rowCount) return NextResponse.json({ error: { message: "找不到這個畫布", code: "not_found" } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
