import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import type { AssetRow } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/assets/:id/raw — streams a private blob, but only to its owner. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const { id } = await ctx.params;
  const assetId = parseInt(id, 10);
  if (!Number.isInteger(assetId)) {
    return NextResponse.json({ error: { message: "素材 id 不正確", code: "bad_id" } }, { status: 400 });
  }

  const { rows } = await sql<AssetRow>`
    select * from assets where id = ${assetId} and user_id = ${r.user.id} limit 1
  `;
  const asset = rows[0];
  if (!asset) {
    return NextResponse.json({ error: { message: "找不到這個素材", code: "not_found" } }, { status: 404 });
  }

  const blob = await get(asset.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: { message: "素材檔案已遺失", code: "blob_missing" } }, { status: 404 });
  }

  return new Response(blob.stream, {
    headers: {
      "Content-Type": asset.content_type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
