import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";
const zh = {
  hint: "輸入 @ 可搜尋參考圖", add: "插入參考圖", list: "選擇參考圖", search: "搜尋圖片名稱", close: "關閉圖片選擇器",
  loading: "正在載入圖片…", empty: "素材庫還沒有可用的圖片。", noMatches: "找不到符合的圖片。",
  error: "部分圖片暫時無法載入。", retry: "重新載入", selected: "已加入", reviewed: "已審核素材",
  personal: "個人素材", business: "商務素材", tooLong: "提示詞剩餘空間不足，請先縮短文字。",
  missing: "標記的圖片已移除，請重新選取圖片或刪除該標記。", limit: "此模式不接受更多圖片，請檢查參考數量與生成模式。",
  mediaHint: "輸入 @ 搜尋圖片或影片", mediaAdd: "插入參考素材", mediaList: "選擇參考素材", mediaSearch: "搜尋素材名稱", mediaClose: "關閉素材選擇器",
  mediaLoading: "正在載入素材…", mediaEmpty: "素材庫還沒有可用的圖片或影片。", mediaNoMatches: "找不到符合的素材。", mediaError: "部分素材暫時無法載入。",
  mediaMissing: "標記的素材已移除，請重新選取或刪除該標記。", mediaLimit: "此模式無法加入更多素材，請檢查素材數量與生成模式。", video: "影片",
};
type Copy = { [K in keyof typeof zh]: string };
const en: Copy = {
  hint: "Type @ to find a reference", add: "Insert reference image", list: "Choose a reference image", search: "Search by image name", close: "Close image picker",
  loading: "Loading images…", empty: "No images available in your library.", noMatches: "No images match your search.",
  error: "Some images could not load.", retry: "Reload", selected: "Added", reviewed: "Reviewed asset",
  personal: "Personal asset", business: "Business asset", tooLong: "Shorten the prompt to make room for the reference.",
  missing: "A tagged image was removed. Select it again or delete its tag.", limit: "This mode cannot accept more images. Check the reference limit and generation mode.",
  mediaHint: "Type @ to find an image or video", mediaAdd: "Insert reference", mediaList: "Choose a reference", mediaSearch: "Search by file name", mediaClose: "Close reference picker",
  mediaLoading: "Loading references…", mediaEmpty: "No images or videos available in your library.", mediaNoMatches: "No references match your search.", mediaError: "Some references could not load.",
  mediaMissing: "A tagged reference was removed. Select it again or delete its tag.", mediaLimit: "This mode cannot accept more references. Check the reference limit and generation mode.", video: "Video",
};
const ja: Copy = {
  hint: "@ で参照画像を検索", add: "参照画像を挿入", list: "参照画像を選ぶ", search: "画像名で検索", close: "画像選択を閉じる",
  loading: "画像を読み込み中…", empty: "ライブラリに使用できる画像がありません。", noMatches: "検索条件に合う画像がありません。",
  error: "一部の画像を読み込めませんでした。", retry: "再読み込み", selected: "追加済み", reviewed: "審査済み素材",
  personal: "個人素材", business: "ビジネス素材", tooLong: "参照を挿入できるよう、プロンプトを短くしてください。",
  missing: "タグ付けした画像が削除されました。再選択するかタグを削除してください。", limit: "このモードには画像を追加できません。参照数と生成モードを確認してください。",
  mediaHint: "@ で参照画像・映像を検索", mediaAdd: "参照素材を挿入", mediaList: "参照素材を選ぶ", mediaSearch: "素材名で検索", mediaClose: "素材選択を閉じる",
  mediaLoading: "素材を読み込み中…", mediaEmpty: "使用できる画像や映像がありません。", mediaNoMatches: "検索条件に合う素材がありません。", mediaError: "一部の素材を読み込めませんでした。",
  mediaMissing: "タグ付けした素材が削除されました。再選択するかタグを削除してください。", mediaLimit: "このモードには素材を追加できません。参照数と生成モードを確認してください。", video: "映像",
};
const COPY: Record<Locale, Copy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export function businessMentionsCopy(locale: Locale, includeVideo = false): Copy {
  const copy = COPY[locale];
  return includeVideo ? {
    ...copy, hint: copy.mediaHint, add: copy.mediaAdd, list: copy.mediaList, search: copy.mediaSearch,
    close: copy.mediaClose, loading: copy.mediaLoading, empty: copy.mediaEmpty, noMatches: copy.mediaNoMatches,
    error: copy.mediaError, missing: copy.mediaMissing, limit: copy.mediaLimit,
  } : copy;
}
