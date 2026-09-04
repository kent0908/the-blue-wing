import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/canvas — list the signed-in user's workflows, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { rows } = await sql`
    select id, name, graph, updated_at, created_at
    from canvas_workflows
    where user_id = ${auth.user.id}
    order by updated_at desc
    limit 60
  `;
  return NextResponse.json({
    workflows: rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      nodeCount: Array.isArray((r.graph as { nodes?: unknown[] })?.nodes) ? (r.graph as { nodes: unknown[] }).nodes.length : 0,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    })),
  });
}

/** POST /api/canvas — create a new (empty, unless a graph is given) workflow. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "未命名畫布";
  const graph = body?.graph && typeof body.graph === "object" ? body.graph : { nodes: [], edges: [] };

  const { rows } = await sql`
    insert into canvas_workflows (user_id, name, graph)
    values (${auth.user.id}, ${name}, ${JSON.stringify(graph)}::jsonb)
    returning id, name, graph, updated_at, created_at
  `;
  const r = rows[0];
  return NextResponse.json({
    workflow: { id: String(r.id), name: r.name, graph: r.graph, updatedAt: r.updated_at, createdAt: r.created_at },
  });
}
