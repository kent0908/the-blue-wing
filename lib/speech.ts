import { synthesizeGemini38Pcm } from "./geminiSpeech38";
import { gcpConfigured } from "./gcpAuth";
import { GCP_SPEECH_MODEL, synthesizeGcpPcm } from "./gcpSpeech";
import { monitoredModelFetch } from "./modelMonitoring";
import { SirayaApiError, SirayaConfigError } from "./siraya";
import { resolveVoice } from "./voices";

/**
 * Text-to-speech for companion replies — Google's Gemini API directly, NOT
 * through SIRAYA: the gateway carries no speech model at all (checked the
 * live catalogue on 2026-09-26: 123 models, the only audio-adjacent entry
 * is qwen3-asr-flash, which is speech→text).
 *
 * Gemini returns raw signed 16-bit little-endian PCM, not a playable file,
 * so the bytes are wrapped in a WAV container here before they are stored.
 *
 * Unconfigured is a first-class state, not an error to debug: the feature
 * ships ahead of the credential (owner's call, 2026-09-26), so every entry
 * point checks speechConfigured() and the UI stays hidden until it flips.
 */

/** Default voice model. Audio output is billed at 25 tokens per second of audio. */
export const SPEECH_MODEL = process.env.SPEECH_PROVIDER === "google-cloud" ? GCP_SPEECH_MODEL : process.env.SPEECH_MODEL?.trim() || "gemini-3.8-flash-tts";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Gemini TTS emits 24 kHz mono PCM16. */
const SAMPLE_RATE = 24_000;

export function speechConfigured(): boolean {
  if (process.env.SPEECH_PROVIDER === "google-cloud") return process.env.GCP_SPEECH_ENABLED === "true" && gcpConfigured();
  return !!process.env.GOOGLE_AI_API_KEY?.trim();
}

export interface SpeechResult {
  /** WAV bytes, ready to store and play */
  audio: Buffer;
  contentType: "audio/wav";
  /** decoded from the byte length, so it reflects the audio actually produced */
  seconds: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Wrap raw PCM16 mono in a 44-byte RIFF/WAVE header. */
export function wavFromPcm16(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2; // mono, 16-bit
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // channels = mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Pull the sample rate out of a `audio/L16;codec=pcm;rate=24000` mime string. */
export function sampleRateOf(mimeType: string | undefined): number {
  const match = /rate=(\d{4,6})/.exec(mimeType ?? "");
  const rate = match ? Number(match[1]) : NaN;
  return Number.isFinite(rate) && rate >= 8000 && rate <= 48000 ? rate : SAMPLE_RATE;
}

/**
 * One synthesis call. `style` is an optional natural-language delivery hint
 * (the character's own tone), prepended the way Gemini's speech prompting
 * expects; it is treated as data about how to read the line, never as
 * instructions — the line itself is quoted after it.
 */
export async function synthesizeSpeech(input: {
  text: string;
  voiceName?: string | null;
  style?: string | null;
}): Promise<SpeechResult> {
  if (process.env.SPEECH_PROVIDER === "google-cloud") {
    if (!speechConfigured()) throw new SirayaConfigError("Google Cloud speech is not enabled");
    const result = await synthesizeGcpPcm(input);
    return {audio:wavFromPcm16(result.pcm),contentType:"audio/wav",seconds:result.seconds,usage:"usage" in result ? result.usage : undefined};
  }
  const key = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!key) throw new SirayaConfigError("GOOGLE_AI_API_KEY is not configured.");

  if (["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"].includes(SPEECH_MODEL)) {
    const result=await synthesizeGemini38Pcm(input,{"x-goog-api-key":key},SPEECH_MODEL);
    return {audio:wavFromPcm16(result.pcm),contentType:"audio/wav",seconds:result.seconds,usage:result.usage};
  }
  const style = String(input.style ?? "").trim().slice(0, 200);
  const prompt = style ? `${style}：${input.text}` : input.text;

  const res = await monitoredModelFetch(`${ENDPOINT}/${encodeURIComponent(SPEECH_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: resolveVoice(input.voiceName) } },
        },
      },
    }),
  }, {model:SPEECH_MODEL,provider:"google"});

  if (!res.ok) {
    // Never surface the provider's raw body: it can echo the request back.
    const detail = await res.json().catch(() => ({}));
    const code = (detail as { error?: { status?: string } })?.error?.status;
    throw new SirayaApiError(res.status === 429 ? 429 : 502, `語音生成失敗（${code || res.status}）`);
  }

  const json = (await res.json()) as {
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const data = part?.inlineData?.data;
  if (!data) throw new SirayaApiError(502, "語音生成沒有回傳音訊");

  const pcm = Buffer.from(data, "base64");
  const rate = sampleRateOf(part?.inlineData?.mimeType);
  return { audio: wavFromPcm16(pcm, rate), contentType: "audio/wav", seconds: pcm.length / (rate * 2), usage: { prompt_tokens: json.usageMetadata?.promptTokenCount, completion_tokens: json.usageMetadata?.candidatesTokenCount, total_tokens: json.usageMetadata?.totalTokenCount } };
}
