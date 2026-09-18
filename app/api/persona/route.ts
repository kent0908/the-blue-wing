import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { getPersona, savePersona } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/persona — the caller's own 陪聊身分（跨所有角色共用）. */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const persona = await getPersona(r.user.id);
  return NextResponse.json({ persona });
}

/** PUT /api/persona — body: { name, bio } */
export async function PUT(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 40);
  const bio = String(body?.bio ?? "").trim().slice(0, 500);

  const previous = await getPersona(r.user.id);
  const nickname = body.nickname === undefined ? previous.nickname ?? "" : String(body.nickname ?? "").trim().slice(0, 30);
  const avatarAssetId = body.avatarAssetId === undefined ? previous.avatarAssetId ?? null : body.avatarAssetId;
  if (avatarAssetId !== null) {
    if (!Number.isSafeInteger(avatarAssetId) || avatarAssetId <= 0) return NextResponse.json({ error: { message: "形象照素材不正確" } }, { status: 400 });
    const { rows } = await sql`select id from assets where id=${avatarAssetId} and user_id=${r.user.id} and content_type like 'image/%'`;
    if (!rows.length) return NextResponse.json({ error: { message: "請選擇自己的圖片素材" } }, { status: 400 });
  }
  const persona = await savePersona(r.user.id, { name, bio, avatarAssetId, nickname });
  return NextResponse.json({ persona });
}
