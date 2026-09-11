import { shareableGraph } from "@/lib/canvas/sharing";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { listVisiblePlazaPosts, createPlazaPost, toPublicPlazaPost } from "@/lib/canvasPlaza";
import type { CanvasGraph } from "@/lib/canvas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/canvas/plaza — any signed-in user, all visible community posts. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const posts = await listVisiblePlazaPosts();
  return NextResponse.json({ posts: posts.map(({ row, authorName }) => toPublicPlazaPost(row, authorName, auth.user.id)) });
}

/**
 * POST /api/canvas/plaza — any signed-in user. body: { name, description?, workflowId }
 * Snapshots the caller's OWN workflow (ownership enforced the same way as
 * every other /api/canvas route) as a new public plaza post.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  const workflowId = parseInt(body?.workflowId, 10);
  if (!name || (!body.graph && !Number.isInteger(workflowId))) {
    return NextResponse.json({ error: { message: "缺少名稱或畫布 id", code: "bad_request" } }, { status: 400 });
  }

  let graph: CanvasGraph;
  try {
    if (body.graph) graph = shareableGraph(body.graph);
    else {
      const { rows } = await sql<{ graph: CanvasGraph }>`select graph from canvas_workflows where id = ${workflowId} and user_id = ${auth.user.id}`;
      if (!rows[0]) return NextResponse.json({ error: {message: "找不到這個畫布"} }, {status:404});
      graph = shareableGraph(rows[0].graph);
    }
  } catch (e) { return NextResponse.json({error:{message:e instanceof Error ? e.message : "工作流格式錯誤",code:"invalid_graph"}}, {status:400}); }
  const post = await createPlazaPost({ userId: auth.user.id, name, description, graph });
  return NextResponse.json(
    { post: toPublicPlazaPost(post, "我", auth.user.id) },
    { status: 201 }
  );
}
