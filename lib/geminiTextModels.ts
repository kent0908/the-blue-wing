/** Exact text IDs only: image, TTS and historical billing IDs are unchanged. */
export const GEMINI_TEXT_REPLACEMENTS: Readonly<Record<string, string>> = {
  "gemini-2.5-pro": "gemini-3.1-pro-preview",
  "gemini-2.5-flash": "gemini-3.8-flash",
  "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
};

export const SUPPORT_CHAT_MODEL = "gemini-3.5-flash-lite";

export function replacementGeminiTextModel(model: string): string | undefined {
  const id = model.toLowerCase();
  return Object.prototype.hasOwnProperty.call(GEMINI_TEXT_REPLACEMENTS, id)
    ? GEMINI_TEXT_REPLACEMENTS[id] : undefined;
}

export function currentGeminiTextModel(model: string): string {
  return replacementGeminiTextModel(model) ?? model;
}
