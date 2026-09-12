import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { assertDoc, cleanName, deleteProject, getProject, summarize, updateProject } from "@/lib/layerProjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}
const notFound = () => NextResponse.json({ error: { message: "找不到這個專案", code: "not_found" } }, { status: 404 });

/** GET /api/editor/projects/:id — the project with its full document. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const id = parseId((await ctx.params).id);
    const row = id === null ? null : await getProject(r.user.id, id);
    if (!row) return notFound();
    return NextResponse.json({ project: summarize(row), doc: row.doc });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/editor/projects/:id — body { name?, doc? } (autosave sends doc; rename sends name). */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const id = parseId((await ctx.params).id);
    if (id === null) return notFound();
    const body = (await req.json().catch(() => null)) as { name?: unknown; doc?: unknown } | null;
    if (!body || (body.doc === undefined && body.name === undefined)) return NextResponse.json({ error: { message: "沒有要更新的內容", code: "bad_request" } }, { status: 400 });
    if (body.doc !== undefined) assertDoc(body.doc);
    const row = await updateProject(r.user.id, id, { ...(body.name !== undefined ? { name: cleanName(body.name) } : {}), ...(body.doc !== undefined ? { doc: body.doc } : {}) });
    if (!row) return notFound();
    return NextResponse.json({ project: summarize(row) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const id = parseId((await ctx.params).id);
    if (id === null || !(await deleteProject(r.user.id, id))) return notFound();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
