import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { getCharacter } from "@/lib/characters";
import { toPublicIdleVideo, hasPendingIdleVideo } from "@/lib/characterIdleVideo";
import { listOutfitChanges, retryOutfitChange } from "@/lib/characterOutfits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

/**
 * POST /api/characters/:id/outfits/:changeId/retry
 * The one free reroll a purchased outfit change comes with — no charge, only
 * usable once per purchase (character_outfit_changes.retry_used).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; changeId: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  try {
    const { id: idStr, changeId: changeIdStr } = await ctx.params;
    const id = parseId(idStr);
    const changeId = parseId(changeIdStr);
    if (id === null || changeId === null) {
      return NextResponse.json({ error: { message: "id 不正確", code: "bad_id" } }, { status: 400 });
    }

    const character = await getCharacter(r.user.id, id);
    if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

    const changes = await listOutfitChanges(id, r.user.id);
    // c.id comes back from Postgres as a string (bigint column) — compare
    // numerically, not by reference equality against the parsed number.
    const change = changes.find((c) => Number(c.id) === changeId);
    if (!change) return NextResponse.json({ error: { message: "找不到這次換裝紀錄", code: "not_found" } }, { status: 404 });

    if (await hasPendingIdleVideo(id, r.user.id)) {
      return NextResponse.json(
        { error: { message: "已經有一支影片正在生成中，請稍後再試", code: "already_pending" } },
        { status: 409 }
      );
    }

    const video = await retryOutfitChange(r.user.id, character, change);
    return NextResponse.json({ video: toPublicIdleVideo(video) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
