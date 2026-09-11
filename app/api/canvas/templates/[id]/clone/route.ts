import { shareableGraph } from "@/lib/canvas/sharing";
import { builtinCanvasTemplate } from "@/lib/canvas/officialTemplates";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { getTemplate } from "@/lib/canvasTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/canvas/templates/:id/clone — any signed-in user. Creates a new
 * canvas_workflows row owned by the caller, seeded with the template's
 * snapshot graph, and returns its id so the client can navigate straight
 * into editing the new copy.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const id = parseInt((await ctx.params).id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: { message: "無效的 id", code: "bad_id" } }, { status: 400 });

  const template = builtinCanvasTemplate(id) ?? await getTemplate(id);
  if (!template) return NextResponse.json({ error: { message: "找不到這個範本", code: "not_found" } }, { status: 404 });

  const { rows } = await sql`
    insert into canvas_workflows (user_id, name, graph)
    values (${auth.user.id}, ${template.name}, ${JSON.stringify(shareableGraph(template.graph))}::jsonb)
    returning id
  `;
  return NextResponse.json({ workflowId: String(rows[0].id) }, { status: 201 });
}
