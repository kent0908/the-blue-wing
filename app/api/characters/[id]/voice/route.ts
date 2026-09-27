import { isCompanionLanguage } from "@/lib/companionVoices";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { setCharacterVoice } from "@/lib/characterAudio";
import { errorResponse } from "@/lib/errors";
import { isVoice } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/characters/<id>/voice — body: { voiceName: string | null }
 *
 * Deliberately NOT part of PATCH /api/characters/<id>, which refuses 官方角色
 * outright because their identity is maintained by us. A voice is the
 * opposite kind of setting: it is this user's own playback preference on
 * their own copy of the character, changes nothing another user sees, and
 * so is editable for official and custom characters alike.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  try {
    const id = Number((await ctx.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const raw = (body as { voiceName?: unknown }).voiceName;
    // null clears the pick and falls back to the default voice.
    if (raw !== null && !isVoice(raw)) {
      return NextResponse.json({ error: { message: "沒有這個聲音", code: "unknown_voice" } }, { status: 400 });
    }

    const language = (body as {language?:unknown}).language;
    if (language !== undefined && !isCompanionLanguage(language)) return NextResponse.json({error:{message:"請選擇日文、中文或英文",code:"unknown_language"}},{status:400});
    const updated = await setCharacterVoice(auth.user.id, id, raw as string | null, language as string | undefined);
    if (!updated) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });
    return NextResponse.json({ voiceName: raw ?? null, language });
  } catch (err) {
    return errorResponse(err);
  }
}
