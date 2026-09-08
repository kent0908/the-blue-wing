import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { deleteTemplate } from "@/lib/canvasTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/canvas/templates/:id — admin only. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const id = parseInt((await ctx.params).id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: { message: "無效的 id", code: "bad_id" } }, { status: 400 });

  const ok = await deleteTemplate(id);
  if (!ok) return NextResponse.json({ error: { message: "找不到這個範本", code: "not_found" } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
