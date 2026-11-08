import type { Locale } from "./locale";

export const canvasWorkspaceCopy = {
  "zh-Hant": {
    more: "更多工作流操作", name: "工作流名稱", canvas: "流程畫布", studio: "藍翼工作流", business: "商務工作流 · BYOK",
    nodes: "{n} 個節點", links: "{n} 條連線", focus: "前往節點", overview: "全貌",
    emptyTitle: "讓第一個想法，有了下一步。", emptyBody: "從文字、素材或一個鏡頭開始，將它們連成你的創作流程。",
    palette: "加入創作節點", close: "關閉節點選單", output: "輸出", input: "輸入",
    add: "加節點", run: "執行", blankCanvas: "空白畫布", saveFailed: "儲存失敗", nameRequired: "請輸入工作流名稱。",
    saveRetry: "未能儲存。請重試，或先匯出草稿。",
    leaveTitle: "離開工作流？", leaveChanges: "這次編輯尚未儲存。", leaveRunning: "已送出的任務可到生成紀錄查看。",
    keepEditing: "繼續編輯", leave: "離開", discard: "不儲存離開", saveAndLeave: "儲存並離開",
  },
  en: {
    more: "More workflow actions", name: "Workflow name", canvas: "Workflow canvas", studio: "Blue Wing workflows", business: "Business workflows · BYOK",
    nodes: "{n} nodes", links: "{n} connections", focus: "Go to node", overview: "Overview",
    emptyTitle: "Give your first idea a next step.", emptyBody: "Begin with words, a reference or a shot. Connect them into your own creative process.",
    palette: "Add a creative node", close: "Close node menu", output: "Output", input: "Input",
    add: "Add node", run: "Run", blankCanvas: "Blank canvas", saveFailed: "Save failed", nameRequired: "Enter a workflow name.",
    saveRetry: "Couldn't save. Try again or export your draft.",
    leaveTitle: "Leave workflow?", leaveChanges: "Your edits haven't been saved.", leaveRunning: "Submitted jobs remain in your generation history.",
    keepEditing: "Keep editing", leave: "Leave", discard: "Leave without saving", saveAndLeave: "Save and leave",
  },
  ja: {
    more: "その他の操作", name: "ワークフロー名", canvas: "フローキャンバス", studio: "Blue Wing ワークフロー", business: "ビジネスフロー · BYOK",
    nodes: "{n} 個のノード", links: "{n} 本の接続", focus: "ノードへ移動", overview: "全体",
    emptyTitle: "最初のひらめきに、次の一歩を。", emptyBody: "言葉、素材、一つのカットから。つなげて、あなただけの制作の流れへ。",
    palette: "制作ノードを追加", close: "ノードメニューを閉じる", output: "出力", input: "入力",
    add: "ノード追加", run: "実行", blankCanvas: "空のキャンバス", saveFailed: "保存失敗", nameRequired: "ワークフロー名を入力してください。",
    saveRetry: "保存できませんでした。再試行するか、下書きを書き出してください。",
    leaveTitle: "ワークフローを閉じますか？", leaveChanges: "変更が保存されていません。", leaveRunning: "送信済みのジョブは生成履歴から確認できます。",
    keepEditing: "編集を続ける", leave: "閉じる", discard: "保存せず閉じる", saveAndLeave: "保存して閉じる",
  },
} satisfies Record<Locale, Record<string, string>>;
