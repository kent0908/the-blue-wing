import { k } from "./i18n/k";

/**
 * Curated allowlist of Gemini TTS prebuilt voices, one per character.
 *
 * An allowlist rather than a free-text field on purpose: the voice name is
 * forwarded verbatim to the speech provider, so anything the user can type
 * would be user input crossing into a provider request. A character row
 * carrying an unknown/stale name falls back to DEFAULT_VOICE instead of
 * failing the request.
 *
 * VERIFY THIS LIST against the live Gemini voice catalogue when the API
 * credential is wired up (2026-09-26: written from the documented prebuilt
 * set; the names have been stable across 2.5/3.x but this has not been
 * exercised against the real endpoint yet). isVoice() is what protects the
 * request either way.
 */
export interface Voice {
  /** provider's prebuiltVoiceConfig.voiceName — never translated */
  id: string;
  /** short description shown in the picker */
  tone: string;
}

export const VOICES: Voice[] = [
  { id: "Kore", tone: k("沉穩清晰") },
  { id: "Aoede", tone: k("輕快自然") },
  { id: "Leda", tone: k("年輕明亮") },
  { id: "Zephyr", tone: k("溫柔通透") },
  { id: "Callirrhoe", tone: k("從容隨和") },
  { id: "Autonoe", tone: k("柔和親切") },
  { id: "Despina", tone: k("平穩順暢") },
  { id: "Erinome", tone: k("乾淨俐落") },
  { id: "Puck", tone: k("活潑俏皮") },
  { id: "Charon", tone: k("低沉穩重") },
  { id: "Fenrir", tone: k("有力直接") },
  { id: "Orus", tone: k("成熟堅定") },
  { id: "Iapetus", tone: k("清朗溫和") },
  { id: "Umbriel", tone: k("放鬆隨性") },
];

export const DEFAULT_VOICE = "Kore";

const BY_ID = new Map(VOICES.map((v) => [v.id, v]));

export function isVoice(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}

/** The voice to actually send: the character's own pick, else the default. */
export function resolveVoice(voiceName: string | null | undefined): string {
  return isVoice(voiceName) ? voiceName : DEFAULT_VOICE;
}

export function voiceTone(id: string): string {
  return BY_ID.get(id)?.tone ?? "";
}
