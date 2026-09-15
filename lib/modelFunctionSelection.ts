import { getGenerationModes } from './generationModes';
import type { Mode } from './types';
import { k } from "./i18n/k";

/** One navigation updates model and operation together; unrelated draft query stays intact. */
export function modelFunctionSelection(query: string, mode: Mode, model: string, requested?: string) {
  if (!model || /nsfw/i.test(model)) throw new Error(k("請選擇一般生成模型"));
  const functions = mode === 'image' || mode === 'video' ? getGenerationModes(model, mode) : [];
  const operation = requested === undefined ? functions.find(item => item.enabled)?.id : functions.find(item => item.enabled && item.id === requested)?.id;
  if (requested !== undefined && !operation) throw new Error(k("此模型功能尚未開放"));
  const params = new URLSearchParams(query);
  params.set('mode', mode); params.set('model', model);
  if (operation) params.set('operation', operation); else params.delete('operation');
  return { model, operation: operation ?? '', href: `/studio?${params}` };
}
