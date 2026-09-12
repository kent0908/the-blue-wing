/** Public card values observed at https://siraya.ai/models/ on 2026-09-12.
 * These are vendor units, never the site's credit/resolution multipliers.
 * The public cards round image prices to cents; retain that precision notice.
 * The Seedance API documentation supplies the SIRAYA/ByteDance API aliases.
 * Owner confirmed NSFW Seed channels use the same version-specific list price.
 */
export interface PublicPrice {
  price: number;
  unit: "image" | "second" | "million_output_tokens";
  inputPrice?: number;
  note?: string;
  source?: string;
}
export const PRICE_SOURCE = "https://siraya.ai/models/";
export const PRICE_CHECKED = "2026-09-12";
const BYTEPLUS = "https://docs.byteplus.com/en/docs/modelark/1544106?redirect=1";
const prices: Record<string, PublicPrice> = {
  "gemini-3.1-flash-lite-image": { price: 30, inputPrice: 0.25, unit: "million_output_tokens", source: "https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite-image", note: "圖片輸出 $30、文字／思考輸出 $1.5、輸入 $0.25／百萬 Token，標準牌價。" },
  "happyhorse-1.1-i2v": { price: 0.07, unit: "second", source: "https://www.alibabacloud.com/help/en/model-studio/model-pricing", note: "新加坡國際版：480p $0.07、720p $0.14、1080p $0.18／秒，未折扣。" },
  "happyhorse-1.1-t2v": { price: 0.07, unit: "second", source: "https://www.alibabacloud.com/help/en/model-studio/model-pricing", note: "新加坡國際版：480p $0.07、720p $0.14、1080p $0.18／秒，未折扣。" },
  "veo-3.1-generate-001": { price: 0.6, unit: "second" },
  "bytedance-seedream-4.0": { price: 0.03, unit: "image" },
  "bytedance-seedream-4.5": { price: 0.04, unit: "image" },
  "dola-seedream-5.0-lite": { price: 0.035, unit: "image", source: BYTEPLUS },
  "dola-seedream-5.0-pro": { price: 0.045, unit: "image", source: BYTEPLUS, note: "單圖 ≤261萬像素 $0.045；較大 $0.09。分層每層 $0.0225／$0.045；第2張起參考圖每張 $0.003，按實際規格核算。" },
  "seedance-2.5": { price: 6.4, unit: "million_output_tokens", note: "480/720p 含影片輸入 $6.4、無影片 $10.7；1080p $7／$11.7（未折扣），每百萬 Token。" },
  "seedance-2.0-mini": { price: 2.1, unit: "million_output_tokens", note: "480/720p 含影片輸入 $2.1、無影片 $3.5／百萬 Token，未套用限時折扣。" },
  "seedance-2.0": { price: 4.3, unit: "million_output_tokens", note: "含／無影片輸入：480/720p $4.3／$7；1080p $4.7／$7.7；4K $2.4／$4，每百萬 Token。" },
  "seedance-2.0-fast": { price: 3.3, unit: "million_output_tokens", note: "480/720p 含影片輸入 $3.3、無影片 $5.6／百萬 Token，未套用限時折扣。" },
  "seedance-1.0-pro": { price: 2.5, unit: "million_output_tokens" },
  "seedance-1.0-pro-fast": { price: 1, unit: "million_output_tokens" },
  "seedance-1.5-pro": { price: 2.4, unit: "million_output_tokens", note: "線上含音訊 $2.4、無音訊 $1.2／百萬 Token；草稿另依官方換算規則。" },
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
  "happyhorse-1.0-i2v": { price: 0.14, unit: "second", note: "720p $0.14、1080p $0.24／秒；按實際解析度核算。" },
  "happyhorse-1.0-t2v": { price: 0.14, unit: "second", note: "720p $0.14、1080p $0.24／秒；按實際解析度核算。" },
};
export function publicPrice(model: string): PublicPrice | undefined {
  let normalized = model.toLowerCase().replace(/^nsfw-(?=(?:(?:dola|bytedance|siraya)-)?seed(?:ance|ream)-)/, "");
  normalized = normalized.replace(/^seedream-(4\.[05])$/, "bytedance-seedream-$1").replace(/^seedream-(5\.0-(?:lite|pro))$/, "dola-seedream-$1");
  const id = normalized.replace(/^(dreamina|bytedance|siraya)-(seedance-)/, "$2");
  return prices[id];
}
export function priceUnitLabel(p?: PublicPrice): string {
  return !p ? "待核對" : p.unit === "image" ? "每張圖片" : p.unit === "second" ? "每秒影片" : "每百萬輸出 Token";
}
