import type { Locale } from "./locale";
const COPY = {
  "zh-Hant": { nativeOnly: "此模型固定生成原生音訊。", audio1080: "此模型只有 1080p 支援原生音訊；720p 將生成無聲影片。", promptLimit: "此模型的提示詞最多 2,500 字。", referenceLimit: "參考素材數量超過此模型支援上限。" },
  en: { nativeOnly: "This model always generates native audio.", audio1080: "Native audio is available only at 1080p. This model produces silent video at 720p.", promptLimit: "This model accepts up to 2,500 prompt characters.", referenceLimit: "Too many reference images for this model." },
  ja: { nativeOnly: "このモデルは常にネイティブ音声を生成します。", audio1080: "ネイティブ音声は1080pのみ対応。720pでは無音の映像を生成します。", promptLimit: "このモデルのプロンプトは最大2,500文字です。", referenceLimit: "このモデルの参考素材数の上限を超えています。" },
} satisfies Record<Locale, { nativeOnly: string; audio1080: string; promptLimit: string; referenceLimit: string }>;
export function klingCopy(locale: Locale) { return COPY[locale]; }
