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
 *
 * 2026-09-16: one flash-class (fast/economy) model per vendor, each with a
 * verified SIRAYA list price and a model_rates row (scripts/apply-rate-card.mjs).
 * The previous sonnet-5 / gpt-5.4 / gemini-3.5-flash picks had no
 * model_rates row at all, so choosing them failed every message with
 * 「此模型尚未設定有效費率」.
 */
export const AUDIO_MODELS = ["deepseek-v4.1-flash", "gemini-3.8-flash", "gpt-5.4-mini", "claude-haiku-4.5"];
