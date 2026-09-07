import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { getCharacter } from "@/lib/characters";
import { toPublicIdleVideo } from "@/lib/characterIdleVideo";
import { listOutfitChanges, retryOutfitChange } from "@/lib/characterOutfits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) ? n : null;
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
    const change = changes.find((c) => c.id === changeId);
    if (!change) return NextResponse.json({ error: { message: "找不到這次換裝紀錄", code: "not_found" } }, { status: 404 });

    const video = await retryOutfitChange(r.user.id, character, change);
    return NextResponse.json({ video: toPublicIdleVideo(video) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
