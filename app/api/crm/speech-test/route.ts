import { GoogleSpeechError } from "@/lib/googleSpeechError";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { gcpConfigured } from "@/lib/gcpAuth";
import { GCP_SPEECH_MODEL, synthesizeGcpPcm } from "@/lib/gcpSpeech";
import { wavFromPcm16 } from "@/lib/speech";
import { limitRequest } from "@/lib/rateLimit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Fixed, non-private sample only. Global DB-backed limit prevents concurrent cost spikes. */
export async function POST(req: NextRequest) {
 const auth=await requireAdmin(req);
 if ("error" in auth) return auth.error;
 if (process.env.GCP_SPEECH_TEST_ENABLED!=="true" || !gcpConfigured()) return NextResponse.json({error:{message:"GCP 語音測試尚未啟用"}},{status:503});
 try {
  if (!await limitRequest(`gcp-speech-admin-test:${GCP_SPEECH_MODEL}`,3,86400)) return NextResponse.json({error:{message:"今日語音測試已達 3 次上限"}},{status:429});
  const result=await synthesizeGcpPcm({text:"今天辛苦了，先休息一下吧。我在這裡，慢慢說就好。",voiceName:"Kore"});
  return new Response(new Uint8Array(wavFromPcm16(result.pcm)),{headers:{"Content-Type":"audio/wav","Cache-Control":"private, no-store","Content-Disposition":"inline; filename=blue-wing-gcp-voice-test.wav","X-Audio-Seconds":result.seconds.toFixed(3),"X-Speech-Model":GCP_SPEECH_MODEL}});
 } catch (e) {
  if (e instanceof Error && /^Gemini 3\.8 語音生成失敗（HTTP 402 [A-Z_]{1,80}）$/.test(e.message)) {
    return NextResponse.json({error:{code:"payment_required",message:"Gemini API 預付額度不足或尚未完成預付設定，請至 Google AI Studio 的 Billing 頁面確認。"}},{status:402});
  }
  if (e instanceof GoogleSpeechError) return NextResponse.json({error:{
    message:e.message,code:e.providerCode,providerStatus:e.httpStatus,detail:e.adminDetail,
  }},{status:502,headers:{"Cache-Control":"private, no-store"}});
  const safe=e instanceof Error && /^Gemini 3\.8 語音生成失敗（HTTP \d{3} [A-Z_]{1,80}）$/.test(e.message) ? e.message : "GCP 語音測試失敗，請檢查專案權限、配額及身分聯盟設定";
  return NextResponse.json({error:{message:safe}},{status:502});
 }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    enabled: process.env.GCP_SPEECH_TEST_ENABLED === "true" && gcpConfigured(),
    publicEnabled: process.env.SPEECH_PROVIDER === "google-cloud" && process.env.GCP_SPEECH_ENABLED === "true" && gcpConfigured(),
    model: GCP_SPEECH_MODEL,
  }, {headers:{"Cache-Control":"private, no-store"}});
}
