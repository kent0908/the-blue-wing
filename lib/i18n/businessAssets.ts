import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";

const zh = {
  title: "素材庫", upload: "上傳素材", choose: "選擇檔案", replaceFiles: "換一批", queued: "待上傳",
  uploadSelected: "上傳 {n} 個檔案", uploading: "上傳中…", registering: "登錄中…", uploadHelp: "格式與上傳須知",
  limits: "一次最多 6 個：圖片小於 30 MB、影片 50 MB、音訊 15 MB。",
  imageLimits: "一次最多 6 張，每張小於 30 MB。",
  formats: "圖片 PNG／JPEG／WebP／GIF；影片 MP4／MOV；音訊 MP3／WAV。",
  imageFormats: "支援 PNG、JPEG、WebP、GIF。",
  noGeneration: "素材私密保存。上傳不會送出生成，儲存費用以供應商帳單為準。",
  consent: "我有權使用這些素材及其中的人物肖像。",
  all: "全部", image: "圖片", video: "影片", audio: "音訊", source: "素材類型",
  status: "素材狀態", allStatus: "所有狀態", active: "可使用", processing: "處理中", failed: "登錄未完成", created: "等待上傳", unknown: "待確認",
  search: "搜尋素材名稱", searchButton: "搜尋", refresh: "重新整理", refreshOne: "更新狀態", loading: "讀取中…", more: "載入更多",
  empty: "還沒有素材", noResults: "找不到符合條件的素材", count: "顯示 {count} 個素材", select: "選取", selected: "已選取",
  readyOnly: "登錄完成後才能作為影片參照。", nativeRequired: "請上傳原圖後再選取。", pendingTitle: "待確認的上傳", recover: "查詢狀態",
  uncertain: "上傳結果待確認。請先查詢下方紀錄。", privateReady: "原檔已保存",
  storageOnly: "原檔可用於圖片參照，影片參照仍需完成登錄。",
  providerNotice: "素材登錄須使用已開通素材功能的 SIRAYA Root Account 金鑰。影片參照以 SIRAYA 審核結果為準。",
  keyNeeded: "請先連接 SIRAYA 金鑰。", keyLink: "連接金鑰", storageUnavailable: "上傳服務尚未開通，請聯絡管理員。",
  serviceUnavailable: "無法讀取 SIRAYA 素材。請確認帳號已開通素材功能。",
  invalidFile: "檔案不符合格式或大小限制。", tooLarge: "檔案超過大小上限。", tooMany: "一次最多上傳 6 個檔案。",
  changed: "金鑰或權限已變更，請重新整理。", error: "操作未完成，請重試。", limit: "待處理上傳已達上限，請先查詢既有紀錄。",
  expired: "上傳授權已過期，請重新選擇檔案。", missing: "找不到完整原檔，請確認上傳是否完成。", rejected: "SIRAYA 未接受登錄，請確認權限與檔案規格。",
  removeFile: "移除檔案", native: "商務原檔", provider: "SIRAYA 素材", capacity: "已達參照上限",
  uploadFinished: "原檔已上傳。可在素材列表查看狀態。", progress: "上傳進度", original: "使用原圖",
};
export type BusinessAssetsCopy = { [K in keyof typeof zh]: string };
const en: BusinessAssetsCopy = {
  title: "Asset library", upload: "Upload assets", choose: "Choose files", replaceFiles: "Replace files", queued: "Files to upload",
  uploadSelected: "Upload {n} selected", uploading: "Uploading…", registering: "Registering…", uploadHelp: "Formats and upload details",
  limits: "Up to 6 files: images under 30 MB, video up to 50 MB, audio up to 15 MB.",
  imageLimits: "Up to 6 images, under 30 MB each.",
  formats: "Images: PNG, JPEG, WebP, GIF. Video: MP4, MOV. Audio: MP3, WAV.",
  imageFormats: "PNG, JPEG, WebP or GIF.",
  noGeneration: "Assets are stored privately. Uploads do not start generation. Storage fees follow your provider invoice.",
  consent: "I have permission to use these files and any depicted likenesses.",
  all: "All", image: "Images", video: "Video", audio: "Audio", source: "Asset type",
  status: "Asset status", allStatus: "All statuses", active: "Ready", processing: "Processing", failed: "Registration incomplete", created: "Awaiting upload", unknown: "Unconfirmed",
  search: "Search assets by name", searchButton: "Search", refresh: "Refresh", refreshOne: "Refresh status", loading: "Loading…", more: "Load more",
  empty: "No assets yet", noResults: "No matching assets", count: "{count} assets shown", select: "Select", selected: "Selected",
  readyOnly: "Registration must finish before use as a video reference.", nativeRequired: "Upload the original image to select it.", pendingTitle: "Unconfirmed uploads", recover: "Check status",
  uncertain: "Upload unconfirmed. Check its record below first.", privateReady: "Original saved",
  storageOnly: "The original is ready for image references. Video references require registration.",
  providerNotice: "Registration requires a SIRAYA Root Account key with asset access. SIRAYA reviews assets for video references.",
  keyNeeded: "Connect your SIRAYA key first.", keyLink: "Connect key", storageUnavailable: "Uploads are not configured. Contact an administrator.",
  serviceUnavailable: "Could not load SIRAYA assets. Check that your account has asset access.",
  invalidFile: "The file does not meet format or size limits.", tooLarge: "The file exceeds its size limit.", tooMany: "Upload up to 6 files at once.",
  changed: "Your key or access changed. Refresh the studio.", error: "Could not complete this action. Try again.", limit: "Upload limit reached. Check pending records first.",
  expired: "Upload authorization expired. Select the file again.", missing: "Original file not found. Check that uploading has finished.", rejected: "SIRAYA declined registration. Check your access and file specs.",
  removeFile: "Remove file", native: "Business original", provider: "SIRAYA asset", capacity: "Reference limit reached",
  uploadFinished: "Original uploaded. Check its status in the library.", progress: "Upload progress", original: "Use original",
};
const ja: BusinessAssetsCopy = {
  title: "素材ライブラリ", upload: "素材をアップロード", choose: "ファイルを選択", replaceFiles: "ファイルを選び直す", queued: "アップロード待ち",
  uploadSelected: "{n}件をアップロード", uploading: "アップロード中…", registering: "登録中…", uploadHelp: "形式とアップロードの詳細",
  limits: "最大6件。画像は30 MB未満、映像は50 MB、音声は15 MBまで。",
  imageLimits: "画像は最大6枚、1枚あたり30 MB未満。",
  formats: "画像：PNG・JPEG・WebP・GIF。映像：MP4・MOV。音声：MP3・WAV。",
  imageFormats: "PNG・JPEG・WebP・GIFに対応。",
  noGeneration: "素材は非公開です。アップロードで生成は開始されません。保存料金は提供元の請求書をご確認ください。",
  consent: "素材と写っている人物の肖像を使う権利があります。",
  all: "すべて", image: "画像", video: "映像", audio: "音声", source: "素材の種類",
  status: "素材の状態", allStatus: "すべての状態", active: "利用可能", processing: "処理中", failed: "登録未完了", created: "アップロード待ち", unknown: "未確認",
  search: "素材名で検索", searchButton: "検索", refresh: "更新", refreshOne: "状態を更新", loading: "読み込み中…", more: "さらに表示",
  empty: "素材はまだありません", noResults: "条件に合う素材がありません", count: "{count}件を表示", select: "選択", selected: "選択済み",
  readyOnly: "映像の参照に使うには登録完了が必要です。", nativeRequired: "元画像をアップロードしてから選択してください。", pendingTitle: "確認待ちのアップロード", recover: "状態を確認",
  uncertain: "結果を確認できません。下の記録を先に確認してください。", privateReady: "原本を保存済み",
  storageOnly: "画像の参照には使えます。映像の参照は登録後に使えます。",
  providerNotice: "登録には素材機能が有効な SIRAYA Root Account のキーが必要です。映像参照用の素材は SIRAYA が審査します。",
  keyNeeded: "先に SIRAYA キーを接続してください。", keyLink: "キーを接続", storageUnavailable: "アップロードが未設定です。管理者にお問い合わせください。",
  serviceUnavailable: "SIRAYA 素材を読み込めません。素材機能が有効かご確認ください。",
  invalidFile: "ファイル形式か容量が対応条件を満たしていません。", tooLarge: "ファイルが容量上限を超えています。", tooMany: "一度に最大6件までアップロードできます。",
  changed: "キーまたは権限が変わりました。画面を更新してください。", error: "操作を完了できませんでした。再試行してください。", limit: "処理待ちの上限に達しました。既存の記録を確認してください。",
  expired: "アップロード権限が失効しました。ファイルを再選択してください。", missing: "原本が見つかりません。アップロードが完了したかご確認ください。", rejected: "SIRAYA が登録を受け付けませんでした。権限とファイル仕様をご確認ください。",
  removeFile: "ファイルを外す", native: "ビジネス原本", provider: "SIRAYA 素材", capacity: "参照素材が上限に達しました",
  uploadFinished: "原本をアップロードしました。素材一覧で状態を確認できます。", progress: "アップロードの進捗", original: "元画像を使う",
};
const COPY: Record<Locale, BusinessAssetsCopy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export function businessAssetsCopy(locale: Locale): BusinessAssetsCopy { return COPY[locale]; }
export function businessAssetsError(t: BusinessAssetsCopy, code?: string): string {
  if (code === "business_asset_upload_uncertain") return t.uncertain;
  if (code === "business_asset_storage_unavailable") return t.storageUnavailable;
  if (code === "business_asset_upload_too_large") return t.tooLarge;
  if (code === "business_asset_upload_limit") return t.limit;
  if (code === "business_asset_upload_expired") return t.expired;
  if (code === "business_asset_upload_missing") return t.missing;
  if (code === "business_asset_upload_rejected") return t.rejected;
  if (code && /credential_required|credential_unavailable/.test(code)) return t.keyNeeded;
  if (code && /changed|suspended|not_approved|unauthorized/.test(code)) return t.changed;
  if (code && /business_asset_unavailable/.test(code)) return t.serviceUnavailable;
  if (code && /invalid|bad_|conflict/.test(code)) return t.invalidFile;
  return t.error;
}
