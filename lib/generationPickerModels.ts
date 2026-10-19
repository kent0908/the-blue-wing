/** The general composer supports images, videos and chat completions.
 * Keep embedding/ASR/TTS models in vendor/admin catalogues and dedicated
 * integrations, rather than offering them as chat-completion models.
 */
import { getKlingVideoModel } from "./klingVideo";
import { getMiniMaxVideoModel } from "./minimaxVideo";
export function isRetiredGenerationModel(id: string): boolean {
  return /(?:^|-)happyhorse[-.]1[.-]0(?:-|$)/i.test(id);
}
export function isGenerationPickerModel(id: string): boolean {
  if (isRetiredGenerationModel(id)) return false;
  if (/^(?:(?:NSFW|SIRAYA)-)*kling(?:-|$)/i.test(id)) return !!getKlingVideoModel(id);
  if (/^(?:(?:NSFW|SIRAYA)-)*minimax-h3(?:-|$)/i.test(id)) return !!getMiniMaxVideoModel(id);
  return !/(?:^|[-_/])(?:embedding|asr|tts)(?:$|[-_/])/i.test(id);
}
