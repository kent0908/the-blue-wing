import { NextResponse } from "next/server";
import { SPEECH_MODEL, speechConfigured } from "@/lib/speech";
import { SPEECH_CHARS_PER_UNIT } from "@/lib/speechText";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/speech/voices — the voice picker's catalogue, plus whether the
 * feature is switched on at all. `enabled` is false until the provider
 * credential is configured; the chat hides its read-aloud controls on that
 * signal rather than offering a button that can only fail.
 *
 * `charsPerUnit` lets the client quote a price before calling: the cost of
 * reading a reply is ceil(spoken characters / charsPerUnit) x the model's
 * credit rate. No auth: this is a static catalogue, nothing user-specific.
 */
export async function GET() {
  return NextResponse.json({
    enabled: speechConfigured(),
    model: SPEECH_MODEL,
    defaultVoice: DEFAULT_VOICE,
    charsPerUnit: SPEECH_CHARS_PER_UNIT,
    voices: VOICES,
  });
}
