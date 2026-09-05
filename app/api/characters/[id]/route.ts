import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { getCharacter, updateCharacter, deleteCharacter, ownedAssetId, toPublicCharacter } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) ? n : null;
}

/** GET /api/characters/:id */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

  const row = await getCharacter(r.user.id, id);
  if (!row) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });
  return NextResponse.json({ character: toPublicCharacter(row) });
}

/** PATCH /api/characters/:id — body: partial { name, avatarAssetId, personality } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

  const existing = await getCharacter(r.user.id, id);
  if (!existing) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: { name?: string; avatarAssetId?: number | null; personality?: string } = {};
  if (typeof body?.name === "string") {
    const name = body.name.trim().slice(0, 40);
    if (!name) return NextResponse.json({ error: { message: "名字不能是空的", code: "missing_name" } }, { status: 400 });
    patch.name = name;
  }
  if (typeof body?.personality === "string") patch.personality = body.personality.trim().slice(0, 2000);
  if ("avatarAssetId" in (body ?? {})) {
    patch.avatarAssetId = await ownedAssetId(r.user.id, Number(body.avatarAssetId) || null);
  }

  const row = await updateCharacter(r.user.id, id, patch);
  if (!row) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });
  return NextResponse.json({ character: toPublicCharacter(row) });
}

/** DELETE /api/characters/:id */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

  const existing = await getCharacter(r.user.id, id);
  if (!existing) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

  await deleteCharacter(r.user.id, id);
  return NextResponse.json({ ok: true });
}
