import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";

const zh = {
  recoverVideo: "重新取得成品", videoRecovered: "已取回原本的影片。", videoNotRecovered: "目前還無法取回原影片。這次沒有重新生成。",
  results: "預覽", recent: "最近作品", expand: "放大查看", close: "關閉預覽", previous: "上一張", next: "下一張",
  reuse: "沿用創作設定", copy: "複製提示詞", copied: "已複製提示詞", copyFailed: "無法複製，請從作品詳情選取提示詞。",
  details: "作品詳情與用量", all: "全部", search: "搜尋提示詞或模型", type: "作品類型", status: "生成狀態", noMatch: "沒有符合條件的作品", clear: "清除篩選",
  pending: "任務在背景處理。完成後可在作品紀錄查看。", unknown: "這筆請求的結果仍未確認。請先查詢原有請求。", submitted: "任務已受理。你可以繼續創作，並在作品紀錄查看進度。",
  registering: "正在登記任務，你可以繼續編輯或切換頁面。",
  resultRecovered: "已取回原本的成品。",
  receiptNotFound: "未查到原有任務，可以重新送出。",
  untrackable: "這筆請求的結果仍未確認。請在作品詳情查看請求編號，再與 SIRAYA 核對。",
  reused: "已帶入原本的提示詞、素材與設定。", missingModel: "目前的金鑰無法使用此作品的模型。",
  reuseLoading: "讀取原本的設定…", reuseFailed: "無法讀取原本的設定，請重試。", reuseMissing: "原本有素材已移除或目前無法使用。請從素材庫重新選取並標記。", reuseLegacy: "這是舊作品，沒有保存原本的素材與設定。只帶入提示詞時，請重新選取素材。",
  reuseTextOnly: "只帶入提示詞", reuseTextLoaded: "已帶入文字。請重新檢查模式與參照素材。", reuseReferenceRequired: "這段提示詞有尚未選取的參照。請補上素材，或改寫提示詞。",
  result: "作品", emptyOutput: "尚未取得可預覽的成果，請重新整理確認。", more: "載入更多", count: "{n} 件作品", latest: "最新優先", oldest: "最舊優先", sort: "排序", original: "開啟原檔",
};
type Copy = { [K in keyof typeof zh]: string };
const en: Copy = {
  recoverVideo: "Retrieve the video", videoRecovered: "The original video is ready.", videoNotRecovered: "The original video is still unavailable. No new generation was started.",
  results: "Preview", recent: "Recent work", expand: "Expand preview", close: "Close preview", previous: "Previous image", next: "Next image",
  reuse: "Reuse setup", copy: "Copy prompt", copied: "Prompt copied", copyFailed: "Unable to copy. Select the prompt in creation details.",
  details: "Creation details & usage", all: "All", search: "Search prompts or models", type: "Creation type", status: "Generation status", noMatch: "No matching creations", clear: "Clear filters",
  pending: "This job runs in the background. Find the result in your work history when ready.", unknown: "The outcome is still unconfirmed. Check the original request before trying again.", submitted: "Job accepted. Keep working and follow its progress in your work history.",
  registering: "Registering the job. You can keep editing or switch pages.",
  resultRecovered: "The original result is ready.",
  receiptNotFound: "The original job could not be found. You can submit again.",
  untrackable: "The outcome is still unconfirmed. Find the request ID in the creation details and verify it with SIRAYA.",
  reused: "Original prompt, references, and settings restored.", missingModel: "Your current key does not have access to this creation’s model.",
  reuseLoading: "Loading the original setup…", reuseFailed: "Could not load the original setup. Try again.", reuseMissing: "Some original references are missing or unavailable. Select and tag the references again.", reuseLegacy: "This older creation does not have a saved setup. If you use the prompt alone, select the references again.",
  reuseTextOnly: "Use prompt only", reuseTextLoaded: "Prompt loaded. Review the mode and references before generating.", reuseReferenceRequired: "This prompt points to references that are not selected. Add the missing references or edit the prompt.",
  result: "Creation", emptyOutput: "No preview is available yet. Refresh to check the result.", more: "Show more", count: "{n} creations", latest: "Newest first", oldest: "Oldest first", sort: "Sort", original: "Open original",
};
const ja: Copy = {
  recoverVideo: "完成映像を再取得", videoRecovered: "元の映像を取得しました。", videoNotRecovered: "元の映像をまだ取得できません。再生成は行っていません。",
  results: "プレビュー", recent: "最近の作品", expand: "プレビューを拡大", close: "プレビューを閉じる", previous: "前の画像", next: "次の画像",
  reuse: "制作設定を再利用", copy: "プロンプトをコピー", copied: "コピーしました", copyFailed: "コピーできません。作品の詳細からプロンプトを選択してください。",
  details: "作品の詳細と使用量", all: "すべて", search: "プロンプトやモデルを検索", type: "作品の種類", status: "生成状況", noMatch: "一致する作品がありません", clear: "絞り込みを解除",
  pending: "バックグラウンドで処理しています。完了後は作品履歴で確認できます。", unknown: "結果はまだ確認できていません。再実行前に元のリクエストを確認してください。", submitted: "受け付けました。制作を続けながら、作品履歴で進捗を確認できます。",
  registering: "ジョブを登録しています。編集を続けたり、別の画面に移動したりできます。",
  resultRecovered: "元の生成結果を取得しました。",
  receiptNotFound: "元のジョブが見つかりませんでした。再送信できます。",
  untrackable: "結果はまだ確認できていません。作品詳細のリクエスト ID を確認し、SIRAYA にお問い合わせください。",
  reused: "元のプロンプト、参照素材、設定を復元しました。", missingModel: "現在のキーではこの作品のモデルを利用できません。",
  reuseLoading: "元の設定を読み込み中…", reuseFailed: "元の設定を読み込めませんでした。もう一度お試しください。", reuseMissing: "元の参照素材の一部が利用できません。素材を選び直し、タグを付けてください。", reuseLegacy: "以前の作品のため、素材や設定が保存されていません。プロンプトだけを使う場合は、参照素材を選び直してください。",
  reuseTextOnly: "プロンプトだけ使う", reuseTextLoaded: "プロンプトを読み込みました。生成前にモードと参照素材を確認してください。", reuseReferenceRequired: "プロンプトに未選択の参照素材があります。素材を追加するか、プロンプトを編集してください。",
  result: "作品", emptyOutput: "プレビューはまだありません。更新して結果を確認してください。", more: "さらに表示", count: "{n} 件の作品", latest: "新しい順", oldest: "古い順", sort: "並び順", original: "元ファイルを開く",
};
const COPY: Record<Locale, Copy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export const businessResultsCopy = (locale: Locale): Copy => COPY[locale];
