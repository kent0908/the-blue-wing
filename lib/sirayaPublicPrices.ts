/** Public card values observed at https://siraya.ai/models/ on 2026-09-12.
 * These are vendor units, never the site's credit/resolution multipliers.
 * The public cards round image prices to cents; retain that precision notice.
 * The Seedance API documentation supplies the SIRAYA/ByteDance API aliases.
 * NSFW channels are not assigned a standard-channel price.
 */
export interface PublicPrice {
  price: number;
  unit: "image" | "second" | "million_output_tokens";
  inputPrice?: number;
  note?: string;
}
export const PRICE_SOURCE = "https://siraya.ai/models/";
export const PRICE_CHECKED = "2026-09-12";
const prices: Record<string, PublicPrice> = {
  "veo-3.1-generate-001": { price: 0.6, unit: "second" },
  "bytedance-seedream-4.0": { price: 0.03, unit: "image" },
  "bytedance-seedream-4.5": { price: 0.04, unit: "image" },
  "dola-seedream-5.0-lite": { price: 0.03, unit: "image", note: "公開頁僅顯示小數兩位，待核對精確單價" },
  "dola-seedream-5.0-pro": { price: 0.04, unit: "image", note: "公開頁僅顯示小數兩位，待核對精確單價" },
  "seedance-2.5": { price: 6.4, unit: "million_output_tokens" },
  "seedance-2.0-mini": { price: 2.1, unit: "million_output_tokens" },
  "seedance-2.0": { price: 4.3, unit: "million_output_tokens" },
  "seedance-2.0-fast": { price: 3.3, unit: "million_output_tokens" },
  "seedance-1.0-pro": { price: 2.5, unit: "million_output_tokens" },
  "seedance-1.0-pro-fast": { price: 1, unit: "million_output_tokens" },
  "seedance-1.5-pro": { price: 2.4, unit: "million_output_tokens", note: "公開牌價為含音訊版本" },
  "gemini-2.5-flash-image": { price: 30, unit: "million_output_tokens", inputPrice: 0.3 },
  "gemini-3.1-flash-image": { price: 60, unit: "million_output_tokens", inputPrice: 0.5 },
  "gemini-3-pro-image": { price: 120, unit: "million_output_tokens", inputPrice: 2 },
  "deepseek-v4-pro-0813": { price: 1.98, unit: "million_output_tokens", inputPrice: 0.66 },
  "deepseek-v4-flash-0731": { price: 0.66, unit: "million_output_tokens", inputPrice: 0.22 },
  "deepseek-v4-pro": { price: 0.87, unit: "million_output_tokens", inputPrice: 0.43 },
  "deepseek-v4-flash": { price: 0.28, unit: "million_output_tokens", inputPrice: 0.14 },
  "gpt-image-2": { price: 30, unit: "million_output_tokens", inputPrice: 5 },
  "gpt-image-2.5-flare": { price: 30, unit: "million_output_tokens", inputPrice: 5 },
  "gpt-image-2.5-sunburst": { price: 30, unit: "million_output_tokens", inputPrice: 5 },
  "happyhorse-1.0-i2v": { price: 0.14, unit: "second" },
  "happyhorse-1.0-t2v": { price: 0.14, unit: "second" },
};
export function publicPrice(model: string): PublicPrice | undefined {
  const id = model.toLowerCase().replace(/^(dreamina|bytedance|siraya)-(seedance-)/, "$2");
  return prices[id];
}
export function priceUnitLabel(p?: PublicPrice): string {
  return !p ? "待核對" : p.unit === "image" ? "每張圖片" : p.unit === "second" ? "每秒影片" : "每百萬輸出 Token";
}
