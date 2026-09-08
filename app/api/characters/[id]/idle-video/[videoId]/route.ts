import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { getCharacter } from "@/lib/characters";
import { setActiveIdleVideo } from "@/lib/characterIdleVideo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

/**
 * PATCH /api/characters/:id/idle-video/:videoId
 * Sets one previously-generated (completed) idle video as this character's
 * active loop — the "選擇生成過的影片當成待機狀態" picker.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  try {
    const { id: idStr, videoId: videoIdStr } = await ctx.params;
    const id = parseId(idStr);
    const videoId = parseId(videoIdStr);
    if (id === null || videoId === null) {
      return NextResponse.json({ error: { message: "id 不正確", code: "bad_id" } }, { status: 400 });
    }

    const character = await getCharacter(r.user.id, id);
    if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

    const ok = await setActiveIdleVideo(id, r.user.id, videoId);
    if (!ok) {
      return NextResponse.json(
        { error: { message: "找不到這支影片，或它還沒生成完成", code: "not_found" } },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
