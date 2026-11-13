import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";

const zh = {
  title: "費用預覽",
  loading: "正在查詢 SIRAYA 牌價…",
  estimate: "預估總額",
  perUnit: "適用的牌價",
  rateDetails: "查看單價",
  priceSource: "SIRAYA 牌價",
  unavailable: "此模型目前沒有可核實的牌價。請先在 SIRAYA 確認價格。",
  duration: "生成長度由模型決定，目前只能顯示單價。",
  usage: "總額依實際用量計算，目前只能顯示單價。",
  settings: "這組設定需要等生成後才能核算總額。",
  settlement: "未計帳戶折扣；實扣以 SIRAYA 帳單為準。",
  noCharge: "查看預覽不會扣款。",
  basis: { seconds: "依設定秒數", images: "依設定張數", videoTokens: "依秒數、畫幅與解析度估算影片 Token（以 24 fps 計）", request: "依單次請求" },
  units: { second: "每秒影片", image: "每張圖片", request: "每次請求", input: "每百萬輸入 Token", output: "每百萬輸出 Token", imageInput: "每百萬圖片輸入 Token", imageOutput: "每百萬圖片輸出 Token", reasoning: "每百萬推理 Token", cache: "每百萬快取 Token" },
};
type Copy = typeof zh;
const en: Copy = {
  title: "Price preview",
  loading: "Checking SIRAYA list prices…",
  estimate: "Estimated total",
  perUnit: "Applicable list rates",
  rateDetails: "View unit rates",
  priceSource: "SIRAYA list prices",
  unavailable: "No verified list price for this model. Check SIRAYA before generating.",
  duration: "The model determines the duration. Only unit rates are available before generation.",
  usage: "The total depends on actual usage. Only unit rates are available before generation.",
  settings: "A total is available after generation for these settings.",
  settlement: "Before account discounts. The SIRAYA bill shows the final charge.",
  noCharge: "Previewing is free.",
  basis: { seconds: "Based on the selected duration", images: "Based on the selected image count", videoTokens: "Video tokens estimated from duration, aspect ratio and resolution at 24 fps", request: "For one request" },
  units: { second: "Per second of video", image: "Per image", request: "Per request", input: "Per 1M input tokens", output: "Per 1M output tokens", imageInput: "Per 1M image input tokens", imageOutput: "Per 1M image output tokens", reasoning: "Per 1M reasoning tokens", cache: "Per 1M cache tokens" },
};
const ja: Copy = {
  title: "料金プレビュー",
  loading: "SIRAYA の標準料金を確認中…",
  estimate: "見積もり合計",
  perUnit: "適用される標準単価",
  rateDetails: "単価を見る",
  priceSource: "SIRAYA の標準料金",
  unavailable: "このモデルの標準料金を確認できません。生成前に SIRAYA でご確認ください。",
  duration: "動画の長さはモデルが決めるため、生成前は単価のみ確認できます。",
  usage: "合計は実際の使用量で決まるため、生成前は単価のみ確認できます。",
  settings: "この設定での合計は生成後に確定します。",
  settlement: "アカウント割引適用前の料金です。実際の請求額は SIRAYA でご確認ください。",
  noCharge: "プレビューに料金はかかりません。",
  basis: { seconds: "設定した秒数に基づく見積もり", images: "設定した枚数に基づく見積もり", videoTokens: "動画の長さ、画面比率、解像度をもとに、24 fps でトークン数を推定", request: "1 回のリクエスト" },
  units: { second: "動画 1 秒あたり", image: "画像 1 枚あたり", request: "1 リクエストあたり", input: "入力 100 万トークンあたり", output: "出力 100 万トークンあたり", imageInput: "画像入力 100 万トークンあたり", imageOutput: "画像出力 100 万トークンあたり", reasoning: "推論 100 万トークンあたり", cache: "キャッシュ 100 万トークンあたり" },
};
const copy: Record<Locale, Copy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export const businessPricePreviewCopy = (locale: Locale) => copy[locale];
