/** Official story directions are private conversation guidance, never global canon changes. */
export interface ReplySuggestion { direction: string; text: string }
export interface OfficialStory { title: string; goal: string; boundary: string; events: string[]; opening: string[] }
export const OFFICIAL_STORIES: Record<string, OfficialStory> = {
  mio: { title: "把責任交給彼此", goal: "確認失散同學的位置，建立可交接的搜索安排。", boundary: "理性不代表冷酷；不靠稱讚換取信任。", events: ["核對名單與最後目擊位置", "協商搜索分工", "回報搜尋結果與未確認資訊", "交接紀錄並安排休息"], opening: ["我幫你核對名單，先從最後見到他們的位置開始。", "我們先把事情分出去，你最需要誰接手哪一部分？", "你現在最擔心哪一個還沒確認的消息？"] },
  aoi: { title: "一起守住退路", goal: "確認危險與撤退路線，保護同學安全通行。", boundary: "直率而有判斷力；可質疑不安全的命令，不是盲目服從的打手。", events: ["查看前方通道", "共同訂出撤退訊號", "互相掩護通過危險區", "檢查傷勢並調整分工"], opening: ["我幫你看退路，先約好遇到危險的訊號。", "你也需要有人掩護，我來守你看不到的方向。", "這條路你最不放心的是哪裡？"] },
  ren: { title: "讓推測接受驗證", goal: "透過安全觀測辨認靈氣與陣法規律。", boundary: "天才也會不確定；不拿同學冒險，不把推論說成事實。", events: ["記錄異常讀數", "提出可驗證的假說", "在安全範圍比較觀測", "留下結果與尚未解決的疑問"], opening: ["我替你記錄讀數，我們先只做觀測。", "先停一下，你需要我幫你核對哪一組數據？", "哪個現象最不符合你原本的推測？"] },
  chinatsu: { title: "畫裡的出口", goal: "以空間記憶整理遺跡路線，找出幾何盲區。", boundary: "安靜不等於沒有主見；給她觀察與表達的時間。", events: ["比對現場與速寫", "指出重複紋樣中的差異", "共同確認安全路線", "將圖稿交給隊友使用"], opening: ["我幫你比對現場，你指給我看哪裡不一樣。", "不用急著解釋，我等你把它畫完。", "你第一眼注意到的是哪一道線？"] },
  takumi: { title: "活過今晚的準備", goal: "建立安全營地，讓防護工作能由全隊接手。", boundary: "冷靜務實；不臆造軍旅背景，不把危險陷阱當遊戲。", events: ["勘查營地與物資", "分配警戒和搭建工作", "檢查防護缺口", "完成值夜交接"], opening: ["我先清點可用物資，你來判斷營地缺什麼。", "值夜不能都交給你，我們排輪班吧。", "選營地時，你會先排除哪些風險？"] },
  miwa: { title: "照顧人的人也需要休息", goal: "整理傷員狀況與照護分工，避免未知藥草造成傷害。", boundary: "溫柔但有原則；不提供現實醫療診斷，不以人體試吃未知藥草。", events: ["確認誰需要優先照護", "整理紀錄和已知物資", "協調照護分工", "回看狀況並安排輪休"], opening: ["我幫你整理紀錄，先把需要注意的人列出來。", "你先喝口水，哪些事情可以交給我？", "面對不認識的藥草，你會先記下哪些疑問？"] },
  sho: { title: "把力量用在對的時刻", goal: "利用投擲與動態視力協助物資接應和掩護。", boundary: "開朗不等於魯莽；保留原服裝，近戰用長棍，不改成劍士。", events: ["確認接應距離與隊友位置", "約定拋接訊號", "配合完成接應", "檢查失誤並調整配合"], opening: ["我幫你確認接應位置，先約好訊號。", "肩膀還好嗎？我們可以換個分工。", "你判斷出手時機時，最先看哪裡？"] },
  rina: { title: "有人守住身後", goal: "辨認外圍異常，建立不暴露同伴的警戒方式。", boundary: "戒心有理由；不逼她說秘密。保留原服裝，以匕首或折疊刀為武器，不使用長劍。", events: ["觀察可疑動靜", "協商彼此能接受的距離與訊號", "完成警戒回報", "讓隊友接手一段守望"], opening: ["我留在你看得到的位置，有動靜就照約定示意。", "不想說的事可以不說，我先幫你守另一側。", "剛才哪個細節讓你覺得不對勁？"] },
  yota: { title: "把聽見的事說出來", goal: "辨認低頻異響，讓預警被隊友理解與核對。", boundary: "害怕不等於無能；不嘲笑、不用巨響逼迫他。", events: ["描述聲音特徵", "找到較安靜的觀測位置", "共同核對聲源方向", "建立簡短預警訊號"], opening: ["我幫你記方向，你慢慢說聽到什麼。", "我們先換個安靜的位置，不用勉強。", "這次的聲音和剛才有哪裡不同？"] },
  toru: { title: "讓大家安心吃一頓飯", goal: "清點可靠食材與潔淨水，分配全隊的飲食工作。", boundary: "細心的後勤夥伴，不是體型笑話；未知植物不能僅靠氣味判定可食。", events: ["清點已確認安全的物資", "討論分配與用水", "分工準備餐食", "記錄剩餘物資並安排下一餐"], opening: ["我來清點食材和水，我們先算每個人的份量。", "這次換我收拾，你也坐下好好吃一份。", "在有限的物資裡，你最想先照顧哪個需要？"] },
};
const DIRECTIONS = ["一起行動", "關心彼此", "深入了解"];
export function openingSuggestions(key: string): ReplySuggestion[] {
  return (OFFICIAL_STORIES[key]?.opening ?? []).map((text, i) => ({ direction: DIRECTIONS[i], text }));
}
export function storyPrompt(key: string): string {
  const s = OFFICIAL_STORIES[key];
  if (!s) return "";
  return `官方互動篇章（不是已發生的正史）：${s.title}。目標：${s.goal}\n可依序探索：${s.events.join(" → ")}。${s.boundary}\n每次只推進一個可理解的小情境，允許拒絕、延後或其他做法。不替使用者說話或完成行動。只有對話中已實際發生的經歷才可回顧為完成；承諾、點選回覆、稱讚、知道秘密均不等於信任或任務完成。使用者私人故事不得改寫官方全局正史。現行官方設定優先於舊對話記憶中的人物背景；不要捏造家庭、獎項、傷亡或過往關係為既定設定。\n依你剛說的話提供三句使用者可說的回覆，分別偏向一起行動、關心彼此、深入了解；不預先宣稱結果，不強迫揭露秘密，也可以婉拒。只輸出 JSON：{"reply":"角色當輪自然反應，最多250字","suggestions":["第一句，最多60字","第二句，最多60字","第三句，最多60字"]}。`;
}
/** Strict envelope: legacy plain text stays readable; malformed structured output fails closed. */
export function parseStoryReply(raw: string): { reply: string; suggestions: ReplySuggestion[] } | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(text);
    if (typeof value.reply !== "string" || !value.reply.trim() || !Array.isArray(value.suggestions) || value.suggestions.length !== 3) return null;
    if (!value.suggestions.every((s: unknown) => typeof s === "string" && s.trim().length > 0 && s.length <= 120)) return null;
    if (new Set(value.suggestions.map((s: string) => s.trim())).size !== 3) return null;
    return { reply: value.reply.trim(), suggestions: value.suggestions.map((s: string, i: number) => ({ direction: DIRECTIONS[i], text: s.trim() })) };
  } catch { return null; }
}
export const STORY_MESSAGE_PREFIX = "[bluewing-story-v1]\n";
export function decodeStoryMessage(raw: string) {
  return raw.startsWith(STORY_MESSAGE_PREFIX) ? parseStoryReply(raw.slice(STORY_MESSAGE_PREFIX.length)) : null;
}

/** Suggestions are optional enrichment: never discard a valid conversation reply. */
export function recoverStoryReply(raw: unknown): { reply: string; suggestions: ReplySuggestion[] } | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const strict = parseStoryReply(raw);
  if (strict) return strict;
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(text);
    if (typeof value?.reply === "string" && value.reply.trim()) return { reply: value.reply.trim(), suggestions: [] };
    return null;
  } catch {
    // Never show broken JSON or internal reasoning as character dialogue.
    if (/^[{[]/.test(text) || /<think[\s>]/i.test(text) || text.startsWith("```")) return null;
    return { reply: text, suggestions: [] };
  }
}
