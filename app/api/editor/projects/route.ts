import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { assertDoc, cleanName, createProject, listProjects, summarize } from "@/lib/layerProjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/editor/projects — the signed-in user's 圖層編輯 projects, newest first (summaries, no documents). */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json({ projects: await listProjects(r.user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/editor/projects — body { name?, doc } → creates a project, returns it with its document. */
export async function POST(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const body = (await req.json().catch(() => null)) as { name?: unknown; doc?: unknown } | null;
    assertDoc(body?.doc);
    const row = await createProject(r.user.id, cleanName(body?.name), body!.doc);
    return NextResponse.json({ project: summarize(row), doc: row.doc }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
