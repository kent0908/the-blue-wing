/** Versioned reference tariffs: official standard online prices checked 2026-09-26.
 * SIRAYA's public catalog returned HTTP 500; provider mapping/settlement is not
 * independently verified. Keep legacy variants pending, never reprice history.
 * Owner confirmed NSFW Seed aliases follow their corresponding standard models.
 */
export interface PublicPrice {
  price: number;
  unit: "image" | "second" | "million_output_tokens";
  inputPrice?: number;
  note?: string;
  source?: string;
  checkedAt?: string;
  verification?: "official" | "pending";
  components?: PriceComponent[];
}
export interface PriceComponent { scenario?: string; id: string; label: string; price: number; unit: "million_tokens" | "image" | "second"; }
export const PRICE_SOURCE = "https://siraya.ai/models/";
export const PRICE_CHECKED = "2026-09-26";
const SIRAYA_API = "https://llm-ext-api.siraya.ai/api/v1/models";
const BYTEPLUS = "https://docs.byteplus.com/en/docs/modelark/1544106?redirect=1";
const prices: Record<string, PublicPrice> = {
  "wan3.0-video": {price:.05,unit:"second"},
  "wan3.0-video-prime": {price:.068,unit:"second"},
  "gemini-2.5-flash-tts": {price:10,inputPrice:.5,unit:"million_output_tokens"},
  "gemini-3.8-flash-tts": { price: 9, inputPrice: .5, unit: "million_output_tokens" },
  "gemini-3.8-flash-lite-tts": { price: 6, inputPrice: .5, unit: "million_output_tokens" },
  "gemini-3.1-flash-lite-image": { price: 30, inputPrice: 0.25, unit: "million_output_tokens", source: "https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite-image", note: "圖片輸出 $30、文字／思考輸出 $1.5、輸入 $0.25／百萬 Token，標準牌價。" },
  "happyhorse-1.1-i2v": { price: 0.07, unit: "second", source: "https://www.alibabacloud.com/help/en/model-studio/model-pricing", note: "新加坡國際版：480p $0.07、720p $0.14、1080p $0.18／秒，未折扣。" },
  "happyhorse-1.1-t2v": { price: 0.07, unit: "second", source: "https://www.alibabacloud.com/help/en/model-studio/model-pricing", note: "新加坡國際版：480p $0.07、720p $0.14、1080p $0.18／秒，未折扣。" },
  "veo-3.1-generate-001": { price: 0.4, unit: "second", note: "含音訊：720/1080p $0.40、4K $0.60／秒；SIRAYA 通道帳單待核對。" },
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
  // 文字創作 curated picks (lib/audioModels.ts) — llm-ext-api.siraya.ai/api/v1/models, 2026-09-16
  "deepseek-v4.1-flash": { price: 0.6, unit: "million_output_tokens", inputPrice: 0.15, source: SIRAYA_API, note: "離峰牌價；平日 01–04 與 06–10 UTC 尖峰時段輸入 $0.3、輸出 $1.2。快取讀取 $0.015。" },
  "gemini-3.5-flash": { price: 9, unit: "million_output_tokens", inputPrice: 1.5, source: SIRAYA_API, note: "快取讀取 $0.15／百萬 Token；另有每百萬 Token 每小時 $1 的快取儲存費。" },
  "gemini-3.8-flash": { price: 3.75, unit: "million_output_tokens", inputPrice: 0.75, source: SIRAYA_API, note: "快取讀取 $0.075／百萬 Token。" },
  "gemini-3.1-pro-preview": { price: 12, unit: "million_output_tokens", inputPrice: 2, source: SIRAYA_API },
  "gemini-3.5-flash-lite": { price: 2.5, unit: "million_output_tokens", inputPrice: .3, source: SIRAYA_API },
  "gpt-5.4-mini": { price: 4.5, unit: "million_output_tokens", inputPrice: 0.75, source: SIRAYA_API, note: "快取讀取 $0.075／百萬 Token。" },
  "claude-haiku-4.5": { price: 5, unit: "million_output_tokens", inputPrice: 1, source: SIRAYA_API, note: "快取讀取 $0.1／百萬 Token。" },
  "gpt-image-2": { price: 15, unit: "million_output_tokens", inputPrice: 2.5 },
  "gpt-image-2.5-flare": { price: 30, unit: "million_output_tokens", inputPrice: 5 },
  "gpt-image-2.5-sunburst": { price: 30, unit: "million_output_tokens", inputPrice: 5 },
  "happyhorse-1.0-i2v": { price: 0.14, unit: "second", note: "720p $0.14、1080p $0.24／秒；按實際解析度核算。" },
  "happyhorse-1.0-t2v": { price: 0.14, unit: "second", note: "720p $0.14、1080p $0.24／秒；按實際解析度核算。" },
};

const GOOGLE = "https://ai.google.dev/gemini-api/docs/pricing";
const OPENAI = "https://developers.openai.com/api/docs/pricing";
const ALIBABA = "https://www.alibabacloud.com/help/en/model-studio/model-pricing";
const DEEPSEEK = "https://api-docs.deepseek.com/quick_start/pricing/";
const token = (id: string, label: string, price: number): PriceComponent => ({ id, label, price, unit: "million_tokens" });
const component = (id: string, label: string, price: number, unit: "image" | "second"): PriceComponent => ({ id, label, price, unit });
function verified(id: string, source: string, components: PriceComponent[], note?: string) {
  Object.assign(prices[id], { source, checkedAt: PRICE_CHECKED, verification: "official", components, ...(note ? { note } : {}) });
}
// Legacy SIRAYA aliases must not silently inherit the replacement model's price.
for (const p of Object.values(prices)) {
  p.checkedAt = "2026-09-12";
  p.verification = "pending";
  p.components = [
    ...(p.inputPrice === undefined ? [] : [token("input", "輸入（舊牌價，待核對）", p.inputPrice)]),
    { id: "output", label: "輸出（舊牌價，待核對）", price: p.price, unit: p.unit === "million_output_tokens" ? "million_tokens" : p.unit },
  ];
}
for (const [id, input, output] of [["gemini-3.1-pro-preview", 2, 12], ["gemini-3.5-flash-lite", .3, 2.5]] as const) {
  verified(id, SIRAYA_API, [token("input", "一般輸入", input), token("output", "輸出", output)]);
  prices[id].checkedAt = "2026-10-09";
}
for (const [id, price] of [["bytedance-seedream-4.0", .03], ["bytedance-seedream-4.5", .04], ["dola-seedream-5.0-lite", .035]] as const)
  verified(id, BYTEPLUS, [component("output", "生成圖片", price, "image")]);
verified("dola-seedream-5.0-pro", BYTEPLUS, [
  component("small", "一般輸出 ≤2,610,000 像素", .045, "image"), component("large", "一般輸出 >2,610,000 像素", .09, "image"),
  component("layerSmall", "分層輸出 ≤2,610,000 像素（每層）", .0225, "image"), component("layerLarge", "分層輸出 >2,610,000 像素（每層）", .045, "image"),
  component("references", "參考圖（第 2 張起）", .003, "image"),
]);
for (const [id, tiers] of Object.entries({
  "seedance-2.5": [["480/720p", 10.7, 6.4], ["1080p", 11.7, 7]],
  "seedance-2.0": [["480/720p", 7, 4.3], ["1080p", 7.7, 4.7], ["4K", 4, 2.4]],
  "seedance-2.0-fast": [["480/720p", 5.6, 3.3]], "seedance-2.0-mini": [["480/720p", 3.5, 2.1]],
} as Record<string, [string, number, number][]>)) {
  verified(id, BYTEPLUS, tiers.flatMap(([resolution, plain, video]) => [token(`${resolution}-plain`, `${resolution}・無影片輸入`, plain), token(`${resolution}-video`, `${resolution}・含影片輸入`, video)]),
    "線上未折扣牌價。擇一規格填入實際計費 Token；含影片輸入時也計入影片用量，不能只用輸出秒數估價。官方限時折扣未自動套用。草稿模式另計，尚未納入。" );
}
verified("seedance-1.0-pro", BYTEPLUS, [token("output", "線上輸出", 2.5)]);
verified("seedance-1.0-pro-fast", BYTEPLUS, [token("output", "線上輸出", 1)]);
verified("seedance-1.5-pro", BYTEPLUS, [token("audio", "含音訊", 2.4), token("silent", "無音訊", 1.2)]);
for (const version of ["1.0", "1.1"]) for (const mode of ["t2v", "i2v"]) {
  verified(`happyhorse-${version}-${mode}`, ALIBABA, (version === "1.1" ? [["480p", .07], ["720p", .14], ["1080p", .18]] : [["720p", .14], ["1080p", .24]]).map(([r, p]) => component(String(r), String(r), Number(p), "second")), "新加坡國際版原廠參考價；需核對 SIRAYA 實際路由與帳單。依成功輸出秒數計費。" );
}
verified("veo-3.1-generate-001", GOOGLE, [component("hd", "720/1080p・含音訊", .4, "second"), component("4k", "4K・含音訊", .6, "second")]);
for (const [id, input, output, text] of [
  ["gemini-2.5-flash-image", .3, 30, 2.5], ["gemini-3.1-flash-image", .5, 60, 3],
  ["gemini-3.1-flash-lite-image", .25, 30, 1.5], ["gemini-3-pro-image", 2, 120, 12],
] as const) verified(id, GOOGLE, [token("input", "輸入文字／圖片", input), token("imageOutput", "圖片輸出", output), token("textOutput", "文字與思考輸出", text)], "依各類 Token 分開加總。圖片參考張數不是 Token 數；思考不得與已含該項的總輸出重複計費。搜尋等工具費另計。" );
for (const id of ["gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]) {
  const old = id === "gpt-image-2";
  verified(id, OPENAI, [token("textInput", "未快取文字輸入", old ? 2.5 : 5), token("imageInput", "未快取圖片輸入", old ? 4 : 8), token("cachedText", "快取文字輸入", old ? .625 : 1.25), token("cachedImage", "快取圖片輸入", old ? 1 : 2), token("imageOutput", "圖片輸出", old ? 15 : 30)], "各類 Token 分開加總；快取價僅限原廠支援的 Responses API 路徑，SIRAYA 是否提供快取折扣需核對帳單。" );
}
verified("gpt-5.4-mini", "https://developers.openai.com/api/docs/models/gpt-5.4-mini", [token("input", "未快取輸入", .75), token("cached", "快取輸入", .075), token("output", "輸出（含推理）", 4.5)]);
verified("claude-haiku-4.5", "https://platform.claude.com/docs/en/about-claude/pricing", [token("input", "一般輸入", 1), token("cache5m", "5 分鐘快取寫入", 1.25), token("cache1h", "1 小時快取寫入", 2), token("cacheRead", "快取讀取", .1), token("output", "輸出", 5)], "全球標準價；快取各欄須互斥，區域平台或工具附加費另計。" );
verified("gemini-3.5-flash", GOOGLE, [token("input", "輸入", 1.5), token("cached", "快取讀取", .15), token("output", "輸出（含思考）", 9)], "原廠標準線上價，無公告調整日期。快取儲存另計：每百萬 Token 每小時 $1。批次價約為一半，此通道是否提供未確認。" );
verified("gemini-3.8-flash", GOOGLE, [token("input", "輸入・至 2026/12/31", .75), token("cached", "快取讀取・至 2026/12/31", .075), token("output", "輸出・至 2026/12/31", 3.75), token("input2027", "輸入・2027/01/01 起", 1.5), token("cached2027", "快取・2027/01/01 起", .15), token("output2027", "輸出・2027/01/01 起", 7.5)], "依呼叫日期擇一組費率；2027 年起牌價調整。工具、音訊與快取儲存費不包含在文字推估內。" );
for (const [id, input, output, cached] of [["deepseek-v4.1-flash", .15, .6, .003], ["deepseek-v4-pro-0813", .66, 1.98, .022]] as const)
  verified(id, DEEPSEEK, [token("input", "離峰・未快取輸入", input), token("cached", "離峰・快取輸入", cached), token("output", "離峰・輸出", output), token("peakInput", "尖峰・未快取輸入", input * 2), token("peakCached", "尖峰・快取輸入", cached * 2), token("peakOutput", "尖峰・輸出", output * 2)], "原廠尖峰：平日 UTC 01–04、06–10（台灣 09–12、14–18），中國法定假日除外。SIRAYA 是否沿用時段與快取優惠待確認。" );
for (const id of ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-0731"])
  prices[id].note = "舊版 SIRAYA 牌價，尚未重新確認。原廠部分舊別名已轉新模型；不可據此推定此 SIRAYA 通道的版本、價格或折扣。";

for (const [id, audio] of [["gemini-3.8-flash-tts", 9], ["gemini-3.8-flash-lite-tts", 6]] as const)
  verified(id, GOOGLE, [token("input", "文字輸入・至 2026/12/31", .5), token("cached", "快取輸入・至 2026/12/31", .125), token("output", "音訊輸出・至 2026/12/31", audio), token("input2027", "文字輸入・2027/01/01 起", 1), token("cached2027", "快取輸入・2027/01/01 起", .25), token("output2027", "音訊輸出・2027/01/01 起", audio*2)], "標準線上價；每秒音訊 25 Token。快取儲存另計：2026 年 $0.50／百萬 Token 小時，2027 年 $1。語音直連 Google，未提供金鑰前功能維持關閉；非 SIRAYA 通道。" );
verified("gemini-2.5-flash-tts", "https://cloud.google.com/text-to-speech/pricing", [token("input", "文字輸入", .5),token("output", "音訊輸出", 10)], "Google Cloud 直連；每秒音訊 25 Token，輸出約 $0.015／分鐘，另加輸入 Token。API 不回傳 Token 用量時不得當作已核實帳單；台灣華語目前為 Preview。");
prices["gemini-2.5-flash-tts"].checkedAt = "2026-09-27";
// Mutually exclusive billing conditions cannot be accidentally summed in one quote.
for (const [id, tiers] of Object.entries({"wan3.0-video":[.05,.1,.2],"wan3.0-video-prime":[.068,.14,.28]})) {
  verified(id, SIRAYA_API, ["480p","720p","1080p"].map((r,i)=>component(r,r,tiers[i],"second")), "SIRAYA 公開牌價；含影片參考時，原廠按輸入加輸出秒數計費。站內目前僅開放文字、圖片參考與首尾幀；折扣需核對帳單。");
  prices[id].checkedAt = "2026-10-07";
}
for (const [id, price] of Object.entries(prices)) for (const c of price.components ?? []) {
  if (id.startsWith("wan3.0-")) c.scenario = c.id;
  if (id.startsWith("seedance-") || id.startsWith("happyhorse-") || id.startsWith("veo-")) c.scenario = c.id;
  if (id === "dola-seedream-5.0-pro" && c.id !== "references") c.scenario = c.id;
  if (["deepseek-v4.1-flash", "deepseek-v4-pro-0813"].includes(id)) c.scenario = c.id.startsWith("peak") ? "peak" : "offpeak";
  if (id.startsWith("gemini-3.8-flash")) c.scenario = c.id.endsWith("2027") ? "2027" : "2026";
}
prices["gemini-2.5-flash-image"].note += " 原廠公告 2026/10/02 停用，SIRAYA 是否繼續提供需確認。";

export function publicPrice(model: string): PublicPrice | undefined {
  let normalized = model.toLowerCase().replace(/^nsfw-(?=(?:(?:dola|bytedance|siraya)-)?seed(?:ance|ream)-)/, "");
  normalized = normalized.replace(/^seedream-(4\.[05])$/, "bytedance-seedream-$1").replace(/^seedream-(5\.0-(?:lite|pro))$/, "dola-seedream-$1");
  const id = normalized.replace(/^(dreamina|bytedance|siraya)-(seedance-)/, "$2");
  return prices[id];
}
export function priceUnitLabel(p?: PublicPrice): string {
  return !p ? "待核對" : p.unit === "image" ? "每張圖片" : p.unit === "second" ? "每秒影片" : "每百萬輸出 Token";
}
