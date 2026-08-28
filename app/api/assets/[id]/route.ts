import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import type { AssetRow } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/assets/:id — remove one of the caller's own assets. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  try {
    await del(asset.pathname);
  } catch (err) {
    // Blob already gone / token missing — still drop the DB row so the UI clears.
    console.error("blob del failed:", err);
  }
  await sql`delete from assets where id = ${assetId}`;

  return NextResponse.json({ ok: true });
}
