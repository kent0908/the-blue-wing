import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";

const zh = {
  title: "上傳素材", choose: "選擇檔案或拖曳到這裡", description: "圖片、影片、音訊 · 每個檔案最多 64 MB · 依序上傳",
  queued: "等待上傳", preparing: "取得上傳授權", uploading: "傳送檔案", registering: "檔案已傳送，正在加入資產庫", completed: "已加入資產庫", cancelled: "已取消", error: "上傳未完成",
  waiting: "正在等待傳輸或儲存服務回覆，完成後會自動加入資產庫。", retry: "重試", cancel: "取消", clear: "清除已完成項目", progress: "上傳進度", timeout: "等待逾時，請重試。已傳送完成的檔案會接續登錄。",
  personal: "我的素材", review: "人物參考素材登錄（選用）", reviewHelp: "檔案上傳後即可在下方管理；需要人物參考功能時，再展開此處提交審核。", unavailable: "上傳服務尚未就緒", refresh: "重新整理",
};
type Copy = { [K in keyof typeof zh]: string };
const en: Copy = {
  title: "Upload assets", choose: "Choose files or drop them here", description: "Images, video and audio · Up to 64 MB per file · Uploaded one at a time",
  queued: "Queued", preparing: "Authorizing upload", uploading: "Transferring file", registering: "File transferred, adding to library", completed: "Added to library", cancelled: "Cancelled", error: "Upload incomplete",
  waiting: "Waiting for the transfer or storage service to respond. The file will be added automatically when complete.", retry: "Retry", cancel: "Cancel", clear: "Clear completed items", progress: "Upload progress", timeout: "The request timed out. Please retry. Files already transferred will resume registration.",
  personal: "My assets", review: "Register character references (optional)", reviewHelp: "Manage uploaded files below. Expand this section to submit character references for review when needed.", unavailable: "Upload service is not ready", refresh: "Refresh",
};
const ja: Copy = {
  title: "素材をアップロード", choose: "ファイルを選択、またはここにドロップ", description: "画像・動画・音声 · 1ファイル最大64 MB · 順番にアップロード",
  queued: "アップロード待ち", preparing: "アップロードを認証中", uploading: "ファイルを送信中", registering: "送信済み・素材庫に登録中", completed: "素材庫に追加しました", cancelled: "キャンセル済み", error: "アップロード未完了",
  waiting: "転送またはストレージからの応答を待っています。完了すると自動で素材庫に追加されます。", retry: "再試行", cancel: "キャンセル", clear: "完了した項目を消去", progress: "アップロードの進行状況", timeout: "タイムアウトしました。再試行してください。送信済みファイルは登録から再開します。",
  personal: "自分の素材", review: "人物参照素材の登録（任意）", reviewHelp: "アップロード済みのファイルは下で管理できます。人物参照が必要な場合は、この項目を開いて審査に提出してください。", unavailable: "アップロードサービスの準備ができていません", refresh: "更新",
};
const COPY: Record<Locale, Copy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export const assetUploadCopy = (locale: Locale): Copy => COPY[locale];
