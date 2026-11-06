import type { Locale } from "./locale";

const zh = {
  results: "創作成果", recent: "最近作品", expand: "放大查看", close: "關閉預覽", previous: "上一張", next: "下一張",
  reuse: "使用提示詞", copy: "複製提示詞", copied: "已複製提示詞", copyFailed: "無法複製，請從作品詳情選取提示詞。",
  details: "作品詳情與用量", all: "全部", search: "搜尋提示詞或模型", type: "作品類型", status: "生成狀態", noMatch: "沒有符合條件的作品", clear: "清除篩選",
  pending: "生成完成後會自動顯示。你可以繼續編輯下一個想法。", unknown: "正在確認原請求的狀態，請勿重複送出。", submitted: "已送出生成，成果會在此自動更新。",
  reused: "已帶入提示詞與模型。請重新選擇參考素材並確認生成設定。", missingModel: "此作品的模型目前無法使用，請選擇其他模型。",
  result: "作品", emptyOutput: "尚未取得可預覽的成果，請重新整理確認。", more: "載入更多", count: "{n} 件作品", latest: "最新優先", oldest: "最舊優先", sort: "排序", original: "開啟原檔",
};
type Copy = { [K in keyof typeof zh]: string };
const en: Copy = {
  results: "Your creations", recent: "Recent creations", expand: "Expand preview", close: "Close preview", previous: "Previous image", next: "Next image",
  reuse: "Use prompt", copy: "Copy prompt", copied: "Prompt copied", copyFailed: "Unable to copy. Select the prompt in creation details.",
  details: "Creation details & usage", all: "All", search: "Search prompts or models", type: "Creation type", status: "Generation status", noMatch: "No matching creations", clear: "Clear filters",
  pending: "Your result will appear automatically. Keep working on your next idea.", unknown: "Checking the original request. Please do not submit it again.", submitted: "Generation submitted. Your result will update here automatically.",
  reused: "Prompt and model loaded. Select references again and review the generation settings.", missingModel: "This creation’s model is currently unavailable. Choose another model.",
  result: "Creation", emptyOutput: "No preview is available yet. Refresh to check the result.", more: "Show more", count: "{n} creations", latest: "Newest first", oldest: "Oldest first", sort: "Sort", original: "Open original",
};
const ja: Copy = {
  results: "制作結果", recent: "最近の作品", expand: "プレビューを拡大", close: "プレビューを閉じる", previous: "前の画像", next: "次の画像",
  reuse: "プロンプトを使用", copy: "プロンプトをコピー", copied: "コピーしました", copyFailed: "コピーできません。作品の詳細からプロンプトを選択してください。",
  details: "作品の詳細と使用量", all: "すべて", search: "プロンプトやモデルを検索", type: "作品の種類", status: "生成状況", noMatch: "一致する作品がありません", clear: "絞り込みを解除",
  pending: "完成すると自動で表示されます。次のアイデアを引き続き編集できます。", unknown: "元のリクエストを確認中です。再送信しないでください。", submitted: "生成を開始しました。結果はここで自動更新されます。",
  reused: "プロンプトとモデルを読み込みました。参照素材を再選択し、生成設定を確認してください。", missingModel: "この作品のモデルは現在利用できません。別のモデルを選択してください。",
  result: "作品", emptyOutput: "プレビューはまだありません。更新して結果を確認してください。", more: "さらに表示", count: "{n} 件の作品", latest: "新しい順", oldest: "古い順", sort: "並び順", original: "元ファイルを開く",
};
export const businessResultsCopy = (locale: Locale): Copy => ({ "zh-Hant": zh, en, ja })[locale];
