import type { Locale } from "./locale";
const zh = {
  hint: "輸入 @ 可搜尋參考圖", add: "插入參考圖", list: "選擇參考圖", search: "搜尋圖片名稱", close: "關閉圖片選擇器",
  loading: "正在載入圖片…", empty: "素材庫還沒有可用的圖片。", noMatches: "找不到符合的圖片。",
  error: "部分圖片暫時無法載入。", retry: "重新載入", selected: "已加入", reviewed: "已審核素材",
  personal: "個人素材", business: "商務素材", tooLong: "提示詞剩餘空間不足，請先縮短文字。",
  missing: "標記的圖片已移除，請重新選取圖片或刪除該標記。", limit: "此模式不接受更多圖片，請檢查參考數量與生成模式。",
};
type Copy = { [K in keyof typeof zh]: string };
const en: Copy = {
  hint: "Type @ to find a reference", add: "Insert reference image", list: "Choose a reference image", search: "Search by image name", close: "Close image picker",
  loading: "Loading images…", empty: "No images available in your library.", noMatches: "No images match your search.",
  error: "Some images could not load.", retry: "Reload", selected: "Added", reviewed: "Reviewed asset",
  personal: "Personal asset", business: "Business asset", tooLong: "Shorten the prompt to make room for the reference.",
  missing: "A tagged image was removed. Select it again or delete its tag.", limit: "This mode cannot accept more images. Check the reference limit and generation mode.",
};
const ja: Copy = {
  hint: "@ で参照画像を検索", add: "参照画像を挿入", list: "参照画像を選ぶ", search: "画像名で検索", close: "画像選択を閉じる",
  loading: "画像を読み込み中…", empty: "ライブラリに使用できる画像がありません。", noMatches: "検索条件に合う画像がありません。",
  error: "一部の画像を読み込めませんでした。", retry: "再読み込み", selected: "追加済み", reviewed: "審査済み素材",
  personal: "個人素材", business: "ビジネス素材", tooLong: "参照を挿入できるよう、プロンプトを短くしてください。",
  missing: "タグ付けした画像が削除されました。再選択するかタグを削除してください。", limit: "このモードには画像を追加できません。参照数と生成モードを確認してください。",
};
export const businessMentionsCopy = (locale: Locale): Copy => ({ "zh-Hant": zh, en, ja })[locale];
