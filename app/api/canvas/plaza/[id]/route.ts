import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { getPlazaPost, deletePlazaPost } from "@/lib/canvasPlaza";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/canvas/plaza/:id — the post's own author, or an admin (moderation). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const id = parseInt((await ctx.params).id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: { message: "無效的 id", code: "bad_id" } }, { status: 400 });

  const post = await getPlazaPost(id);
  if (!post) return NextResponse.json({ error: { message: "找不到這篇分享", code: "not_found" } }, { status: 404 });
  if (post.user_id !== auth.user.id && auth.user.role !== "admin") {
    return NextResponse.json({ error: { message: "沒有權限刪除", code: "forbidden" } }, { status: 403 });
  }

  await deletePlazaPost(id);
  return NextResponse.json({ ok: true });
}
