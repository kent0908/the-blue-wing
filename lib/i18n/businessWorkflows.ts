import type { Locale } from "./locale";

const zh = {
  start: "確認並開始生成", cancel: "返回調整", reviewTitle: "執行前審閱",
  invalidSettings: "請檢查整條流程的秒數、音訊與描述長度；尚未送出這次生成。",
  sourceLimit: "每個原檔節點最多 16 張，實際參照數量仍依下游模型規格。",
  nav: "工作流", title: "我的工作流", create: "新增工作流", name: "工作流名稱", untitled: "未命名工作流", empty: "還沒有工作流。",
  open: "開啟", loading: "載入中…", error: "無法載入工作流。", retry: "重試", back: "回工作流", nodes: "{n} 個節點", singleNode: "1 個節點", search: "搜尋工作流",
  count: "{n} 份工作流", singleDraft: "1 份工作流", filteredCount: "{n}／{total} 份工作流", noMatches: "沒有符合的工作流。",
  rename: "更名", saveName: "儲存名稱", renamed: "名稱已儲存", renaming: "儲存中…", nameRequired: "請輸入名稱。",
  renameFailed: "未能儲存名稱，請重試。", renameConflict: "工作流已更新。請關閉後重新更名。", starter: "起始版型",
  createAndOpen: "建立並開啟", creating: "建立中…", createFailed: "未能建立工作流，請重試。", dismiss: "取消", close: "關閉",
  billing: "費用由 SIRAYA 計收，不扣藍翼點數。",
  history: "作品與生成紀錄", costs: "查看實際費用", keyRequired: "請先在商務工作室連接自己的 SIRAYA Key。", approval: "請先完成商務工作室核准。", goStudio: "開啟商務工作室",
  confirm: "這次將依連線順序執行 {n} 個節點，其中 {paid} 個會使用自己的 SIRAYA 額度生成。\n\n{models}\n\n重跑會重新生成並再次計費；金額以 SIRAYA 帳單為準。是否開始？",
  model: "模型", size: "圖片尺寸", resolution: "解析度", seconds: "秒數", aspect: "畫幅", audio: "生成原生音訊", prompt: "創作描述", promptHint: "連接文字節點，或在這裡補上描述。",
  references: "商務圖片素材", choose: "選擇或上傳素材", done: "完成選取", remove: "移除素材", sourceHint: "使用商務原檔；生成圖連到下一個節點時，每筆成果取第一張。", none: "尚未加入素材", originalRequired: "請先在商務素材庫上傳原圖。",
  unavailableModel: "請選擇目前 Key 可用的模型。", missingPrompt: "請輸入描述，或接上文字節點。", invalidReference: "此參照尚未接入，請使用商務原檔或本工作室已完成的圖片。", missingCapture: "請先在 3D 導演台截圖。",
  uncertain: "生成結果尚未確認。請先到商務作品查詢原任務，避免重複計費。", failed: "生成未完成，請在商務作品查看這筆任務。", noOutput: "尚未取得可用成果。", captureUploadFailed: "3D 截圖尚未完成儲存，這次未送出生成。",
  draftOnly: "編輯免費，確認後才會送出生成。", feesUnknown: "費用待對帳", blank: "空白畫布", imageVideo: "文字 → 圖片 → 影片", sourceTemplate: "素材 → 圖片", age: "成人模型需先在商務工作室完成年齡確認。", noModels: "目前沒有可用的生成模型。", newTab: "在工作室查看", nodeRun: "執行紀錄", conflict: "這張畫布已在其他頁面更新。請匯出草稿後重新載入，避免覆寫。",
};
export type BusinessWorkflowsCopy = { [K in keyof typeof zh]: string };
const en: BusinessWorkflowsCopy = {
  start: "Confirm and generate", cancel: "Back to editing", reviewTitle: "Review this run",
  invalidSettings: "Check duration, audio settings and prompt length across this run. No generation was submitted.",
  sourceLimit: "Up to 16 originals per source node, within the downstream model's reference limit.",
  nav: "Workflows", title: "My workflows", create: "New workflow", name: "Workflow name", untitled: "Untitled workflow", empty: "No workflows yet.",
  open: "Open", loading: "Loading…", error: "Could not load workflows.", retry: "Retry", back: "Back to workflows", nodes: "{n} nodes", singleNode: "1 node", search: "Search workflows",
  count: "{n} workflows", singleDraft: "1 workflow", filteredCount: "{n} of {total} workflows", noMatches: "No matching workflows.",
  rename: "Rename", saveName: "Save name", renamed: "Name saved", renaming: "Saving…", nameRequired: "Enter a name.",
  renameFailed: "Could not save the name. Try again.", renameConflict: "This workflow changed. Close and reopen Rename.", starter: "Starting layout",
  createAndOpen: "Create and open", creating: "Creating…", createFailed: "Could not create a workflow. Try again.", dismiss: "Cancel", close: "Close",
  billing:"SIRAYA bills the run. Blue Wing credits are not used.",history:"Work and generation records",costs:"View actual costs",keyRequired:"Connect your own SIRAYA key in the business studio first.",approval:"Your business studio must be approved first.",goStudio:"Open business studio",confirm:"Run {n} nodes in connection order. {paid} nodes will generate using your own SIRAYA balance.\n\n{models}\n\nRunning again creates new generations and new charges. Your SIRAYA invoice determines the amount. Start?",
  model:"Model",size:"Image size",resolution:"Resolution",seconds:"Seconds",aspect:"Aspect ratio",audio:"Generate native audio",prompt:"Describe your work",promptHint:"Connect a text node or add your description here.",references:"Business image sources",choose:"Select or upload material",done:"Finish selection",remove:"Remove source",sourceHint:"Use business originals. Chained generated images use the first image from each completed job.",none:"No sources selected",originalRequired:"Upload the original image in business assets first.",unavailableModel:"Choose a model available to your current key.",missingPrompt:"Enter a description or connect a text node.",invalidReference:"Use business originals or completed images from this business studio.",missingCapture:"Capture an image in the 3D director first.",uncertain:"The result is unconfirmed. Check the original job in business work before submitting again.",failed:"Generation did not finish. Check this job in business work.",noOutput:"No usable result was returned.",captureUploadFailed:"The 3D capture was not saved. No generation was submitted.",draftOnly:"Editing is free. Generation starts after confirmation.",feesUnknown:"Awaiting billing",blank:"Blank canvas",imageVideo:"Text → image → video",sourceTemplate:"Source → image",age:"Confirm your age in the business studio before using adult models.",noModels:"No generation models are available.",newTab:"View in studio",nodeRun:"Run history",conflict:"This canvas changed in another tab. Export your draft and reload before saving over it.",
};
const ja: BusinessWorkflowsCopy = {
  start: "確認して生成", cancel: "編集に戻る", reviewTitle: "実行前の確認",
  invalidSettings: "実行全体の秒数・音声設定・説明の長さを確認してください。生成はまだ送信されていません。",
  sourceLimit: "原本ノードごとに最大16枚。接続先モデルの参考数制限も適用されます。",
  nav: "ワークフロー", title: "マイワークフロー", create: "新規作成", name: "ワークフロー名", untitled: "無題のワークフロー", empty: "ワークフローはまだありません。",
  open: "開く", loading: "読み込み中…", error: "ワークフローを読み込めませんでした。", retry: "再試行", back: "ワークフローへ戻る", nodes: "{n}個のノード", singleNode: "1個のノード", search: "ワークフローを検索",
  count: "{n}件", singleDraft: "1件", filteredCount: "全{total}件中{n}件", noMatches: "一致するワークフローはありません。",
  rename: "名前を変更", saveName: "名前を保存", renamed: "名前を保存しました", renaming: "保存中…", nameRequired: "名前を入力してください。",
  renameFailed: "名前を保存できませんでした。再試行してください。", renameConflict: "ワークフローが更新されました。閉じてから名前を変更し直してください。", starter: "ひな形",
  createAndOpen: "作成して開く", creating: "作成中…", createFailed: "ワークフローを作成できませんでした。再試行してください。", dismiss: "キャンセル", close: "閉じる",
  billing:"料金は SIRAYA が請求します。藍翼ポイントは消費しません。",history:"作品・生成履歴",costs:"実料金を確認",keyRequired:"先にビジネス制作室でご自身の SIRAYA キーを接続してください。",approval:"先にビジネス制作室の承認が必要です。",goStudio:"ビジネス制作室を開く",confirm:"接続順に{n}個のノードを実行し、うち{paid}個がご自身の SIRAYA 残高を使用して生成します。\n\n{models}\n\n再実行は新たな生成・課金になります。金額は SIRAYA の請求に基づきます。開始しますか？",
  model:"モデル",size:"画像サイズ",resolution:"解像度",seconds:"秒数",aspect:"画面比率",audio:"音声も生成",prompt:"作品の説明",promptHint:"文章ノードを接続するか、ここに説明を入力します。",references:"ビジネス画像素材",choose:"素材を選択・アップロード",done:"選択を完了",remove:"素材を外す",sourceHint:"ビジネス原本を使用します。生成画像をつなぐ場合、完了した各ジョブの最初の1枚を使います。",none:"素材は未選択です",originalRequired:"先にビジネス素材庫へ原画像をアップロードしてください。",unavailableModel:"現在のキーで利用できるモデルを選択してください。",missingPrompt:"説明を入力するか文章ノードを接続してください。",invalidReference:"ビジネス原本か、この制作室で生成済みの画像を使ってください。",missingCapture:"先に3D監督台で画像を撮影してください。",uncertain:"結果は未確認です。再送信の前にビジネス作品で元のジョブを確認してください。",failed:"生成が完了しませんでした。ビジネス作品でジョブを確認してください。",noOutput:"利用できる成果を取得できませんでした。",captureUploadFailed:"3D画像を保存できず、生成は送信していません。",draftOnly:"編集は無料です。生成は確認後に始まります。",feesUnknown:"請求待ち",blank:"空のキャンバス",imageVideo:"文章 → 画像 → 映像",sourceTemplate:"素材 → 画像",age:"成人向けモデルには制作室での年齢確認が必要です。",noModels:"利用できる生成モデルがありません。",newTab:"制作室で確認",nodeRun:"実行履歴",conflict:"別の画面で画布が更新されました。草稿を書き出し、再読み込みしてください。",
};
const COPY: Record<Locale, BusinessWorkflowsCopy> = { "zh-Hant": zh, en, ja };
export const businessWorkflowsCopy = (locale: Locale) => COPY[locale];
export const workflowText = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
