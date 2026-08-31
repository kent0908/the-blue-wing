import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { sql } from "@/lib/db";
import { getBlock } from "@/lib/homeBlocks";
import type { AssetRow } from "@/lib/assets";

export const runtime = "nodejs";
export const revalidate = 300;

/**
 * GET /api/content/:id/image — PUBLIC. Streams the admin-uploaded image for a
 * home_blocks row (the blob store is private, so we proxy it). No auth: this is
 * site chrome, visible to anonymous visitors.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const blockId = parseInt(id, 10);
  if (!Number.isInteger(blockId)) {
    return NextResponse.json({ error: { message: "bad id" } }, { status: 400 });
  }

  const block = await getBlock(blockId);
  if (!block?.asset_id) {
    return NextResponse.json({ error: { message: "no image" } }, { status: 404 });
  }

  const { rows } = await sql<AssetRow>`select * from assets where id = ${block.asset_id} limit 1`;
  const asset = rows[0];
  if (!asset) return NextResponse.json({ error: { message: "asset missing" } }, { status: 404 });

  const blob = await get(asset.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: { message: "blob missing" } }, { status: 404 });
  }

  return new Response(blob.stream, {
    headers: {
      "Content-Type": asset.content_type,
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
