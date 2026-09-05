/**
 * 語音生成 (audio mode) model curation.
 *
 * SIRAYA has no real audio/speech modality — checked the live /v1/models
 * list directly: zero entries with "tts"/"speech"/"audio"/"voice" in the id,
 * and the endpoint doesn't even return a modality field at all (this app's
 * own modalityOf() heuristic in lib/pricing.ts classifies by id pattern and
 * falls back to "text" for anything that isn't clearly image/video). So
 * 語音生成 today is really just the chat-completions fallback (see
 * app/studio/page.tsx / lib/jobsStore.tsx) wearing a microphone icon — it
 * returns text, not an audio file.
 *
 * That fallback used to show the FULL "text"-classified model list, which
 * is ~80 chat/LLM ids (every Claude/GPT/Gemini/DeepSeek/Qwen version and
 * variant SIRAYA carries) — hence "太雜" (too messy). This curates it down
 * to one well-known model per major family, intersected with whatever's
 * actually live so a stale id here never produces a dead pick.
 */
export const AUDIO_MODELS = ["claude-sonnet-5", "gpt-5.4", "gemini-3.5-flash", "deepseek-v4-pro"];
