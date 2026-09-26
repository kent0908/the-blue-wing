import { STORY_MESSAGE_PREFIX } from "./officialCompanionStory";

/**
 * What actually gets spoken, and what it costs.
 *
 * Companion replies carry two things TTS must not read aloud:
 *   1. official-character replies are stored as STORY_MESSAGE_PREFIX + JSON
 *      (reply + three suggestions) — feeding that to a voice model would
 *      read out a JSON blob;
 *   2. custom replies routinely contain stage directions in full-width
 *      parentheses — （輕輕望向窗外）— which are written to be read, not
 *      heard. Real sample of 74 stored replies: they are ~10-15% of the
 *      characters, so stripping them is both correctness and billing.
 *
 * Billing is by the SPOKEN character count, computed from the same string
 * that is sent to the provider, so the quote the user sees on the play
 * button is exactly what the call will cost.
 */

/** Characters of speech per billing unit. See SPEECH_RATE_NOTE in scripts/apply-rate-card.mjs. */
export const SPEECH_CHARS_PER_UNIT = 40;

/** Hard ceiling per request — a runaway reply must not turn into a minute of billed audio. */
export const MAX_SPEECH_CHARS = 1000;

export function spokenText(raw: string): string {
  let text = String(raw ?? "");
  if (text.startsWith(STORY_MESSAGE_PREFIX)) {
    try {
      const parsed = JSON.parse(text.slice(STORY_MESSAGE_PREFIX.length)) as { reply?: unknown };
      text = typeof parsed.reply === "string" ? parsed.reply : "";
    } catch {
      text = text.slice(STORY_MESSAGE_PREFIX.length);
    }
  }
  return text
    // stage directions: full-width （…）and *…* / （…） style asides
    .replace(/（[^）]{0,120}）/g, " ")
    .replace(/\([^)]{0,120}\)/g, " ")
    .replace(/\*[^*\n]{0,120}\*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_CHARS);
}

/** Billable units for a piece of speech — never zero for a non-empty string. */
export function speechUnits(text: string): number {
  return Math.max(1, Math.ceil(text.length / SPEECH_CHARS_PER_UNIT));
}
