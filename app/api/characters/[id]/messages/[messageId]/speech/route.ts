import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { requireAdultUser } from "@/lib/apiauth";
import { blobConfigured } from "@/lib/assets";
import { getMessageAudio, ownedAssistantMessage, saveMessageAudio } from "@/lib/characterAudio";
import { creditCost, getBalance } from "@/lib/credits";
import { paidCall, refundCharge } from "@/lib/creditTransactions";
import { errorResponse } from "@/lib/errors";
import { SPEECH_MODEL, speechConfigured, synthesizeSpeech } from "@/lib/speech";
import { spokenText } from "@/lib/speechText";
import { companionVoiceSettings, companionSpeechDirection, isCompanionLanguage } from "@/lib/companionVoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const parseId = (raw: string) => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * POST /api/characters/<id>/messages/<messageId>/speech — read this reply aloud.
 *
 * Generating costs credits; replaying does not. An already-generated message
 * returns its cached url with credits 0 BEFORE any balance check, so a user
 * who has run out of credits can still replay what they already paid for.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const auth = await requireAdultUser(req);
  if ("error" in auth) return auth.error;

  try {
    const params = await ctx.params;
    const characterId = parseId(params.id);
    const messageId = parseId(params.messageId);
    if (characterId === null || messageId === null) {
      return NextResponse.json({ error: { message: "角色或訊息編號不正確", code: "bad_id" } }, { status: 400 });
    }

    const message = await ownedAssistantMessage(auth.user.id, characterId, messageId);
    if (!message) return NextResponse.json({ error: { message: "找不到這則訊息", code: "not_found" } }, { status: 404 });
    const cached = await getMessageAudio(auth.user.id, messageId);
    if (cached) {
      return NextResponse.json({ url: `/api/media/${cached.pathname}`, credits: 0, cached: true, voiceName: cached.voice_name });
    }

    // Feature flag: the UI ships before the credential does, so an
    // un-configured install must say so plainly rather than 500.
    if (!speechConfigured()) {
      return NextResponse.json({ error: { message: "語音功能尚未啟用", code: "speech_unavailable" } }, { status: 503 });
    }
    if (!blobConfigured()) {
      return NextResponse.json({ error: { message: "語音儲存尚未設定，請聯絡管理員", code: "storage_unavailable" } }, { status: 503 });
    }


    const text = spokenText(message.content);
    if (!text) return NextResponse.json({ error: { message: "這則訊息沒有可朗讀的內容", code: "nothing_to_speak" } }, { status: 422 });

    const {voiceName} = companionVoiceSettings(message);
    const language = isCompanionLanguage(message.speech_language) ? message.speech_language : "zh-TW";
    const style = companionSpeechDirection(message, language);
    const cost = await creditCost({ kind: "speech", model: SPEECH_MODEL, speechChars: text.length });
    const balance = await getBalance(auth.user.id);
    if (balance < cost) {
      return NextResponse.json(
        { error: { message: `點數不足：朗讀這則需要 ${cost} 點，你目前有 ${balance} 點。`, code: "insufficient_credits" }, cost, balance },
        { status: 402 }
      );
    }

    const { result: speech, chargeId } = await paidCall(auth.user.id, cost, "speech", SPEECH_MODEL, () =>
      synthesizeSpeech({ text, voiceName, language, style })
    );

    // Store + record, refunding if either fails — the same gap already fixed
    // in /api/images and the companion message route: paidCall has reserved
    // the charge by this point and nothing else would ever give it back.
    try {
      const blob = await put(`generations/${auth.user.id}/speech-${Date.now()}.wav`, speech.audio, {
        access: "private",
        contentType: speech.contentType,
        addRandomSuffix: true,
      });
      await saveMessageAudio({
        messageId,
        characterId,
        userId: auth.user.id,
        voiceName,
        pathname: blob.pathname,
        seconds: Number.isFinite(speech.seconds) ? Number(speech.seconds.toFixed(2)) : null,
        chars: text.length,
        credits: cost,
      });
      return NextResponse.json({
        url: `/api/media/${blob.pathname}`,
        credits: cost,
        cached: false,
        voiceName,
        seconds: speech.seconds,
        creditsBalance: balance - cost,
      });
    } catch (err) {
      await refundCharge(auth.user.id, chargeId);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
