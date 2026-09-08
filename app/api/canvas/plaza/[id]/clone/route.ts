import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { getPlazaPost, incrementCopyCount } from "@/lib/canvasPlaza";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/canvas/plaza/:id/clone — any signed-in user (including the
 * post's own author, cloning their own share back into a fresh copy is
 * harmless). Creates a new owned canvas_workflows row from the post's
 * snapshot graph and bumps its copy_count.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const id = parseInt((await ctx.params).id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: { message: "無效的 id", code: "bad_id" } }, { status: 400 });

  const post = await getPlazaPost(id);
  if (!post || post.status !== "visible") {
    return NextResponse.json({ error: { message: "找不到這篇分享", code: "not_found" } }, { status: 404 });
  }

  const { rows } = await sql`
    insert into canvas_workflows (user_id, name, graph)
    values (${auth.user.id}, ${post.name}, ${JSON.stringify(post.graph)}::jsonb)
    returning id
  `;
  await incrementCopyCount(id);
  return NextResponse.json({ workflowId: String(rows[0].id) }, { status: 201 });
}
