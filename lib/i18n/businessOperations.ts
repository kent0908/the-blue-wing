import type { Locale } from "./locale";

const zh = {
  assets: "素材", work: "作品", usage: "費用", models: "模型", keys: "金鑰",
  assetTitle: "商務素材庫", assetDescription: "在這裡上傳、確認素材狀態，再把它帶進下一個鏡頭。",
  usageTitle: "每一次創作，都有清楚的紀錄。", usageDescription: "只記錄這間商務工作室的請求。費用來自 SIRAYA 實際帳單，不使用一般創作區的點數或零售價格。",
  modelsTitle: "為你的作品，選一種可能。", modelsDescription: "依目前金鑰讀取 SIRAYA 模型。商務目錄獨立於一般創作區；專用工具會清楚標示所需的介面。",
  recordCount: "{count} 筆紀錄", previous: "上一頁", next: "下一頁", all: "全部", image: "圖片", video: "影片", text: "文字", audio: "音訊", tool: "專用工具", other: "其他",
  search: "搜尋模型名稱", count: "{count} 個模型", ready: "可創作", dedicated: "需要專用介面", useModel: "使用模型", refresh: "更新目錄", refreshing: "正在讀取…", noModels: "沒有符合條件的模型。",
  adapterRequired: "這個模型需要對應的專用工具，尚不能由目前的圖片、影片或文字表單送出。", retired: "平台已停用的舊版本，保留辨識並建議使用新版。",
  disabled: "尚未開放生成", providerPricing: "由你的 SIRAYA 帳號計價；實際折扣與消耗請查看費用紀錄。",
  providerRequest: "SIRAYA 請求編號", submitted: "送出時間", completed: "完成時間", elapsed: "生成耗時", responseTime: "提交回應時間", observedTime: "由本平台記錄的送出至結果確認時間", providerTime: "供應商請求耗時", durationPending: "處理中", cost: "實際費用", totalCost: "已對帳費用", pendingCost: "待對帳", unmatchedCost: "尚無可對帳紀錄", unavailableCost: "目前的對帳授權未涵蓋此請求", legacyCost: "舊請求未保留對帳編號", noCostEstimate: "尚未取得帳單時不顯示推估費用，也不將未知金額當作零。",
  syncCost: "查詢實際費用", syncing: "正在對帳…", billingFailed: "暫時無法取得帳單，請稍後再試。", billingUnavailable: "目前無法核對這組金鑰的帳單。生成金鑰仍可使用；帳單查詢需要相符的 SIRAYA Console 授權。",
  dateFrom: "開始日期", dateTo: "結束日期", status: "狀態", model: "模型", apply: "套用", clear: "清除", totalJobs: "請求數", completedJobs: "完成", failedJobs: "失敗", pendingJobs: "處理中", download: "下載明細", noHistory: "這個範圍尚無商務生成紀錄。", unknown: "未取得", seconds: "秒", generationId: "工作編號", inspect: "查看作品", reload: "更新紀錄",
  imageCount: "圖片張數", quality: "品質", seed: "隨機種子", negative: "不希望出現的內容", automatic: "由模型決定", selectedAssets: "已選素材", openAssets: "管理商務素材", downloadImage: "下載圖片", downloadVideo: "下載影片",
};
export type BusinessOperationsCopy = { [K in keyof typeof zh]: string };
const en: BusinessOperationsCopy = {
  assets: "Assets", work: "Work", usage: "Costs", models: "Models", keys: "Keys",
  assetTitle: "Business asset library", assetDescription: "Upload here, check processing status and bring the material into your next shot.",
  usageTitle: "A clear record of every creation.", usageDescription: "Only requests from this business workspace appear here. Costs come from actual SIRAYA billing, independent of personal-studio credits or retail prices.",
  modelsTitle: "Find the right medium for your idea.", modelsDescription: "SIRAYA models available to your connected key. This catalogue is independent of the personal studio; models requiring a dedicated interface are identified clearly.",
  recordCount: "{count} records", previous: "Previous page", next: "Next page", all: "All", image: "Images", video: "Video", text: "Text", audio: "Audio", tool: "Specialist tools", other: "Other",
  search: "Search model names", count: "{count} models", ready: "Ready to create", dedicated: "Dedicated interface required", useModel: "Use model", refresh: "Refresh catalogue", refreshing: "Loading…", noModels: "No models match your filters.",
  adapterRequired: "This model requires its own specialist tool and cannot be submitted through the current image, video or text form.", retired: "An older version disabled on this platform; retained for identification. Use its replacement.",
  disabled: "Generation unavailable", providerPricing: "Billed by your SIRAYA account. Check your cost records for actual charges and discounts.",
  providerRequest: "SIRAYA request ID", submitted: "Submitted", completed: "Completed", elapsed: "Generation time", responseTime: "Submission response time", observedTime: "Time recorded by this workspace from submission to confirmation of the result", providerTime: "Provider request time", durationPending: "Processing", cost: "Actual cost", totalCost: "Reconciled cost", pendingCost: "Awaiting billing", unmatchedCost: "No matching billing record yet", unavailableCost: "The current billing authorization does not cover this request", legacyCost: "No billing ID was retained for this older request", noCostEstimate: "Missing billing is never shown as an estimate or treated as zero.",
  syncCost: "Check actual cost", syncing: "Checking billing…", billingFailed: "Billing is temporarily unavailable. Try again later.", billingUnavailable: "Billing for this key cannot currently be reconciled. Generation remains available; billing requires matching SIRAYA Console authorization.",
  dateFrom: "From", dateTo: "To", status: "Status", model: "Model", apply: "Apply", clear: "Clear", totalJobs: "Requests", completedJobs: "Completed", failedJobs: "Failed", pendingJobs: "Processing", download: "Download records", noHistory: "No business generations were found in this range.", unknown: "Unavailable", seconds: "s", generationId: "Job ID", inspect: "View work", reload: "Refresh records",
  imageCount: "Image count", quality: "Quality", seed: "Random seed", negative: "Content to avoid", automatic: "Let the model decide", selectedAssets: "Selected assets", openAssets: "Manage business assets", downloadImage: "Download image", downloadVideo: "Download video",
};
const ja: BusinessOperationsCopy = {
  assets: "素材", work: "作品", usage: "利用料金", models: "モデル", keys: "キー",
  assetTitle: "ビジネス素材庫", assetDescription: "ここでアップロードと処理状況を確認し、次のショットに素材を取り込みます。",
  usageTitle: "ひとつひとつの制作を、明確な記録に。", usageDescription: "このビジネス制作室のリクエストだけを表示します。料金は SIRAYA の実請求額であり、通常制作のポイントや小売価格とは別です。",
  modelsTitle: "作品に合う表現を、見つける。", modelsDescription: "接続中のキーで利用できる SIRAYA モデルです。通常制作とは独立した目録で、専用ツールが必要なモデルも明示します。",
  recordCount: "{count} 件", previous: "前のページ", next: "次のページ", all: "すべて", image: "画像", video: "映像", text: "文章", audio: "音声", tool: "専用ツール", other: "その他",
  search: "モデル名を検索", count: "{count} モデル", ready: "制作可能", dedicated: "専用画面が必要", useModel: "モデルを使う", refresh: "目録を更新", refreshing: "読み込み中…", noModels: "条件に一致するモデルがありません。",
  adapterRequired: "このモデルには専用ツールが必要で、現在の画像・映像・文章フォームからは送信できません。", retired: "このプラットフォームで無効にした旧版です。確認用に表示し、後継版の利用を推奨します。",
  disabled: "生成は未対応", providerPricing: "ご自身の SIRAYA アカウントで課金されます。実際の割引・利用額は料金履歴で確認してください。",
  providerRequest: "SIRAYA リクエストID", submitted: "送信日時", completed: "完了日時", elapsed: "生成時間", responseTime: "送信応答時間", observedTime: "制作室が送信から結果確認までを記録した時間", providerTime: "提供元のリクエスト時間", durationPending: "処理中", cost: "実際の料金", totalCost: "照合済み料金", pendingCost: "請求待ち", unmatchedCost: "一致する請求記録はまだありません", unavailableCost: "現在の請求権限はこのリクエストに対応していません", legacyCost: "過去のリクエストに請求IDが残っていません", noCostEstimate: "請求記録がない場合、推定額やゼロとしては表示しません。",
  syncCost: "実際の料金を確認", syncing: "請求を確認中…", billingFailed: "請求記録を取得できません。後ほど再試行してください。", billingUnavailable: "現在、このキーの請求を照合できません。生成は利用できますが、請求照会には対応する SIRAYA Console 権限が必要です。",
  dateFrom: "開始日", dateTo: "終了日", status: "状態", model: "モデル", apply: "適用", clear: "解除", totalJobs: "リクエスト", completedJobs: "完了", failedJobs: "失敗", pendingJobs: "処理中", download: "明細を保存", noHistory: "この期間のビジネス生成履歴はありません。", unknown: "未取得", seconds: "秒", generationId: "ジョブID", inspect: "作品を見る", reload: "履歴を更新",
  imageCount: "画像枚数", quality: "品質", seed: "ランダムシード", negative: "避けたい内容", automatic: "モデルに任せる", selectedAssets: "選択した素材", openAssets: "ビジネス素材を管理", downloadImage: "画像を保存", downloadVideo: "映像を保存",
};
const COPY: Record<Locale, BusinessOperationsCopy> = { "zh-Hant": zh, en, ja };
export const businessOperationsCopy = (locale: Locale) => COPY[locale];
