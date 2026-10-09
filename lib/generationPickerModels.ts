/** The general composer supports images, videos and chat completions.
 * Keep embedding/ASR/TTS models in vendor/admin catalogues and dedicated
 * integrations, rather than offering them as chat-completion models.
 */
export function isGenerationPickerModel(id: string): boolean {
  return !/(?:^|[-_/])(?:embedding|asr|tts)(?:$|[-_/])/i.test(id);
}
