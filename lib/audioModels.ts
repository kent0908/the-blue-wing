/**
 * Curated models for 文字創作. The historical file/"audio" mode identifier
 * remains for saved links, but this picker calls chat completions and returns
 * text. Dedicated speech APIs (including Kling TTS) are separate operations.
 * Intersect this list with the live provider catalogue and preserve the exact
 * model ID when building the provider request.
 *
 * MiniMax M3's exact ID was verified by read-only SIRAYA GET /v1/models on
 * 2026-10-19. Keep the four existing choices and their default order intact.
 */
/**
 * 2026-09-26: Google's slot moved from gemini-3.8-flash to gemini-3.5-flash.
 * Measured on the live gateway, same prompt, five runs each, with reasoning
 * already switched off (lib/siraya.ts CHAT_DEFAULTS):
 *
 *   gemini-3.8-flash       2.6s median but a 30s spike, and on a separate
 *                          run 3.1s / 146s / 299s for the same prompt;
 *                          reasoning leaked through despite the parameter
 *   gemini-3.7-flash       1,427 reasoning tokens, replies averaging 16
 *                          characters — truncated to junk
 *   gemini-3.6-flash       1,425 reasoning tokens, 14-character replies
 *   gemini-3.5-flash       0 reasoning, full replies, 2.3-3.7s  <-- chosen
 *   gemini-3.5-flash-lite  0 reasoning, 1.5-2.1s, but shorter replies
 *
 * 3.6/3.7/3.8 ignore reasoning_effort and spend the whole budget thinking,
 * which is exactly the empty-reply failure the default was meant to stop.
 */
export const AUDIO_MODELS = ["deepseek-v4.1-flash", "gemini-3.5-flash", "gpt-5.4-mini", "claude-haiku-4.5", "minimax-m3"];
