import type { Locale } from "./locale";

const zh = {
  confirmTitle: "先看見這個鏡頭",
  confirmLead: "這次只生成 480p 草稿，不會自動生成或扣除 1080p 成片費用。",
  draftCost: "本次草稿",
  finalCost: "後續 1080p 成片（另計）",
  unit: "點",
  rule: "草稿完成後可在「草稿紀錄」審看。原任務自建立起 7 天內可接續成片；成片沿用原構圖、動作與聲音設定。改故事時請建立新草稿。",
  confirm: "確認費用，生成草稿",
  cancel: "繼續調整",
};
type Copy = { [K in keyof typeof zh]: string };
export const DRAFT_COMPOSER_COPY: Record<Locale, Copy> = {
  "zh-Hant": zh,
  en: { confirmTitle: "See the shot first", confirmLead: "This creates only a 480p draft. A 1080p final is never generated or charged automatically.", draftCost: "This draft", finalCost: "Later 1080p final (separate)", unit: "credits", rule: "Review the result in Drafts. The original task can be continued within 7 days of creation, retaining its composition, motion and audio settings. Create a new draft to change the story.", confirm: "Confirm cost and create draft", cancel: "Keep refining" },
  ja: { confirmTitle: "まず、この一場面を確かめる", confirmLead: "今回は 480p の草稿のみを生成します。1080p 完成版の生成と課金は、自動では行われません。", draftCost: "今回の草稿", finalCost: "1080p 完成版（別料金）", unit: "pt", rule: "生成後は「草稿一覧」で確認できます。元のタスクの作成から 7 日以内に、構図・動き・音声設定を引き継いで完成版を生成できます。物語を変える場合は、新しい草稿を作成してください。", confirm: "料金を確認して草稿を生成", cancel: "調整を続ける" },
};
