import { NextRequest, NextResponse } from "next/server";
import { get, put } from "@vercel/blob";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { getBlock } from "@/lib/homeBlocks";
import { blobConfigured, toPublicAsset, type AssetRow } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/templates/use  { blockId }
 * Copies a template's reference image into the caller's own asset library so
 * they can use it in a generation. Returns { ref } or { ref: null } when the
 * template has no image. Prompt / model / params come from GET /api/home-blocks.
 */
export async function POST(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  const { user } = r;

  const body = await req.json().catch(() => ({}));
  const block = await getBlock(Number(body.blockId));
  if (!block) {
    return NextResponse.json({ error: { message: "找不到模板", code: "not_found" } }, { status: 404 });
  }
  if (!block.asset_id || !blobConfigured()) {
    return NextResponse.json({ ref: null });
  }

  const { rows } = await sql<AssetRow>`select * from assets where id = ${block.asset_id} limit 1`;
  const src = rows[0];
  if (!src) return NextResponse.json({ ref: null });

  try {
    const blob = await get(src.pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200) return NextResponse.json({ ref: null });
    const buf = Buffer.from(await new Response(blob.stream).arrayBuffer());

    const uploaded = await put(`assets/${user.id}/tpl-${block.id}-${Date.now()}`, buf, {
      access: "private",
      addRandomSuffix: true,
      contentType: src.content_type,
    });
    const { rows: ins } = await sql<AssetRow>`
      insert into assets (user_id, url, pathname, content_type, size, filename)
      values (${user.id}, ${uploaded.url}, ${uploaded.pathname}, ${src.content_type}, ${buf.length}, ${src.filename ?? block.title ?? null})
      returning id, user_id, url, pathname, content_type, size, filename, created_at`;
    return NextResponse.json({ ref: toPublicAsset(ins[0]) });
  } catch (err) {
    console.error("template image clone failed:", err);
    return NextResponse.json({ ref: null });
  }
}
