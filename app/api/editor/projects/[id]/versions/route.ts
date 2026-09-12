import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { addVersion, assertDoc, listVersions } from "@/lib/layerProjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

/** GET /api/editor/projects/:id/versions — snapshot list (newest first), without documents. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const id = parseId((await ctx.params).id);
    if (id === null) return NextResponse.json({ error: { message: "找不到這個專案", code: "not_found" } }, { status: 404 });
    return NextResponse.json({ versions: await listVersions(r.user.id, id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/editor/projects/:id/versions — body { label?, doc } → snapshot. The editor calls this around every AI step and on 存版本. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const id = parseId((await ctx.params).id);
    if (id === null) return NextResponse.json({ error: { message: "找不到這個專案", code: "not_found" } }, { status: 404 });
    const body = (await req.json().catch(() => null)) as { label?: unknown; doc?: unknown } | null;
    assertDoc(body?.doc);
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    const v = await addVersion(r.user.id, id, label || "手動存檔", body!.doc);
    if (!v) return NextResponse.json({ error: { message: "找不到這個專案", code: "not_found" } }, { status: 404 });
    return NextResponse.json({ version: v }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
