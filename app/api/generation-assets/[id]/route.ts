import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { sql } from "@/lib/db";
import type { AssetRow } from "@/lib/assets";
import { GENERATION_IMAGE_TYPES, verifyGenerationAssetToken } from "@/lib/generationAssetUrls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; sandbox" };
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = req.nextUrl.searchParams.get("user") ?? "";
  const expiry = req.nextUrl.searchParams.get("expires") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (![id, user, expiry].every(value => /^[1-9]\d*$/.test(value))) return NextResponse.json({ error: "素材連結無效或已過期" }, { status: 403, headers });
  const assetId = Number(id), userId = Number(user);
  try {
    if (!verifyGenerationAssetToken(userId, assetId, Number(expiry), token)) return NextResponse.json({ error: "素材連結無效或已過期" }, { status: 403, headers });
    const { rows } = await sql<AssetRow>`select * from assets where id = ${assetId} and user_id = ${userId} limit 1`;
    const asset = rows[0];
    if (!asset || !GENERATION_IMAGE_TYPES.has(asset.content_type)) return NextResponse.json({ error: "找不到素材" }, { status: 404, headers });
    const blob = await get(asset.pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "找不到素材" }, { status: 404, headers });
    return new Response(blob.stream, { headers: { ...headers, "Content-Type": asset.content_type } });
  } catch {
    return NextResponse.json({ error: "素材暫時無法讀取" }, { status: 503, headers });
  }
}
