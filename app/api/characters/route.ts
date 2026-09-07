import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { validateProfile } from "@/lib/characterProfile";
import { listCharacters, createCharacter, ownedAssetId, toPublicCharacter } from "@/lib/characters";
import { startIdleVideoGeneration } from "@/lib/characterIdleVideo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 40;
const MAX_PERSONALITY = 2000;
const MAX_LIKES = 200;

/** GET /api/characters — the signed-in user's 陪聊角色, most recently chatted-with first. */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const rows = await listCharacters(r.user.id);
  return NextResponse.json({ characters: rows.map(toPublicCharacter) });
}

/** POST /api/characters — body: { name, avatarAssetId?, personality? } */
export async function POST(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, MAX_NAME);
  if (!name) {
    return NextResponse.json({ error: { message: "請幫角色取個名字", code: "missing_name" } }, { status: 400 });
  }
  const personality = String(body?.personality ?? "").trim().slice(0, MAX_PERSONALITY);
  const likes = String(body?.likes ?? "").trim().slice(0, MAX_LIKES);
  let profile;
  try { profile = validateProfile(body?.profile ?? {}); }
  catch (e) { return NextResponse.json({ error: { message: e instanceof Error ? e.message : "角色設定不正確" } }, { status: 400 }); }

  // Only let the character point at an asset the caller actually owns.
  const avatarAssetId = await ownedAssetId(r.user.id, Number(body?.avatarAssetId) || null);

  const row = await createCharacter(r.user.id, { name, avatarAssetId, personality, likes, profile });

  // Best-effort: spend this month's free idle-video slot (if any is left) on
  // the character's first loop right away. allowPaid:false means this is a
  // genuine no-op (not an error) when the free slot is already used this
  // month — never auto-charges. A SIRAYA submission failure here must never
  // fail character creation itself.
  try {
    await startIdleVideoGeneration(r.user.id, row, { allowPaid: false });
  } catch (err) {
    console.error("auto idle-video generation failed for new character:", err);
  }

  return NextResponse.json({ character: toPublicCharacter(row) }, { status: 201 });
}
