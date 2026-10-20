import type { Locale } from "./locale";

export const canvasConnectionsCopy = {
  "zh-Hant": {
    help: "拖曳圓點到相同顏色的接點，或依序點選兩端。按 Esc 取消。",
    connecting: "選擇亮起的輸入接點；靠近時會自動吸附。",
    connected: "連線已建立。輸入端已有連線時，新連線會取代原連線。",
    cancelled: "已取消連線，原連線仍保留。",
    type: "資料種類不同，請選擇相同顏色的接點。",
    self: "節點不能連接自己。", cycle: "這條連線會形成循環，請選擇其他節點。", missing: "接點已不存在。",
    output: "輸出：", input: "輸入：", edge: "連線：", remove: "刪除選取連線", removed: "已刪除連線。", cancel: "取消連線", selected: "已選取連線，可按 Delete 刪除。",
    run: "即將執行 {n} 個節點，預估 {c} 點。每次重跑都會重新計費。是否繼續？",
    runTitle: "執行前確認", runCancel: "先不要", runConfirm: "確認並執行",
  },
  en: {
    help: "Drag a dot to an input of the same color, or select both ends in sequence. Esc cancels.",
    connecting: "Choose a highlighted input. Nearby ports snap into place.",
    connected: "Connection created. A new connection replaces any connection on that input.",
    cancelled: "Connection cancelled. The original connection is preserved.",
    type: "These data types differ. Choose a port of the same color.",
    self: "A node cannot connect to itself.", cycle: "This connection would create a cycle. Choose another node.", missing: "This port no longer exists.",
    output: "Output: ", input: "Input: ", edge: "Connection: ", remove: "Delete selected connection", removed: "Connection deleted.", cancel: "Cancel connection", selected: "Connection selected. Press Delete to remove it.",
    run: "Run {n} nodes for an estimated {c} credits? Every rerun is charged again.",
    runTitle: "Review this run", runCancel: "Cancel", runConfirm: "Confirm and run",
  },
  ja: {
    help: "丸い接点を同じ色の入力へドラッグ、または両端を順に選択。Esc でキャンセル。",
    connecting: "強調表示された入力を選択してください。近づくと接点に吸着します。",
    connected: "接続しました。同じ入力への既存の接続は、新しい接続に置き換わります。",
    cancelled: "接続をキャンセルしました。元の接続は保持されています。",
    type: "データの種類が異なります。同じ色の接点を選択してください。",
    self: "ノードを自分自身には接続できません。", cycle: "循環が発生するため接続できません。他のノードを選択してください。", missing: "この接点は存在しません。",
    output: "出力：", input: "入力：", edge: "接続：", remove: "選択した接続を削除", removed: "接続を削除しました。", cancel: "接続をキャンセル", selected: "接続を選択しました。Delete で削除できます。",
    run: "{n} 個のノードを推定 {c} ポイントで実行します。再実行するたびに料金が発生します。続行しますか？",
    runTitle: "実行前の確認", runCancel: "キャンセル", runConfirm: "確認して実行",
  },
} satisfies Record<Locale, Record<string, string>>;
