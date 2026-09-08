import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { listTemplates, createTemplate, toPublicTemplate } from "@/lib/canvasTemplates";
import type { CanvasGraph } from "@/lib/canvas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/canvas/templates — any signed-in user, the full official list. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const rows = await listTemplates();
  return NextResponse.json({ templates: rows.map(toPublicTemplate) });
}

/**
 * POST /api/canvas/templates — admin only. body: { name, description?, workflowId }
 * Snapshots the admin's OWN workflow (workflowId, must belong to them —
 * same ownership rule as every other /api/canvas route) as a new official
 * template. Publishing doesn't touch or link back to that source workflow.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  const workflowId = parseInt(body?.workflowId, 10);
  if (!name || !Number.isInteger(workflowId)) {
    return NextResponse.json({ error: { message: "缺少名稱或畫布 id", code: "bad_request" } }, { status: 400 });
  }

  const { rows } = await sql<{ graph: CanvasGraph }>`
    select graph from canvas_workflows where id = ${workflowId} and user_id = ${auth.user.id}
  `;
  if (!rows[0]) return NextResponse.json({ error: { message: "找不到這個畫布", code: "not_found" } }, { status: 404 });

  const template = await createTemplate({ name, description, graph: rows[0].graph, createdBy: auth.user.id });
  return NextResponse.json({ template: toPublicTemplate(template) }, { status: 201 });
}
