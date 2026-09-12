import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { getVersion } from "@/lib/layerProjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

/** GET /api/editor/projects/:id/versions/:versionId — one snapshot's document (the editor loads it to 回到這個版本). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; versionId: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const p = await ctx.params;
    const id = parseId(p.id);
    const versionId = parseId(p.versionId);
    const v = id === null || versionId === null ? null : await getVersion(r.user.id, id, versionId);
    if (!v) return NextResponse.json({ error: { message: "找不到這個版本", code: "not_found" } }, { status: 404 });
    return NextResponse.json({ version: { id: Number(v.id), label: v.label, createdAt: v.created_at }, doc: v.doc });
  } catch (err) {
    return errorResponse(err);
  }
}
