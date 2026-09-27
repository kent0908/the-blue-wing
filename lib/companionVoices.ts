import { isVoice, resolveVoice } from "./voices";

export const COMPANION_LANGUAGES = [
  { id: "ja-JP", label: "日本語", instruction: "使用自然日文，標準日語發音，不附中文或英文翻譯。" },
  { id: "zh-TW", label: "中文（繁體）", instruction: "使用繁體中文與自然台灣華語，不附其他語言翻譯。" },
  { id: "en-US", label: "English", instruction: "Use natural conversational English with clear American pronunciation. Do not add translations." },
] as const;
export type CompanionLanguage = typeof COMPANION_LANGUAGES[number]["id"];
export function isCompanionLanguage(value: unknown): value is CompanionLanguage {
  return COMPANION_LANGUAGES.some(l => l.id === value);
}
export interface OfficialVoice {
  voice: string;
  description: string;
  direction: string;
  samples: Record<CompanionLanguage, string>;
}
/** Artistic casting based on companionOfficialSeed; audition pending provider access. */
export const OFFICIAL_VOICES: Record<string, OfficialVoice> = {
  mio: {voice:"Kore", description:"冷靜清晰・有條理的少女聲線", direction:"年輕女性，冷靜知性，中等語速，分句清晰。關心藏在務實的提醒裡，不用播報腔。", samples:{"ja-JP":"まず、落ち着いて。けがはない？ 一つずつ確認しよう。","zh-TW":"先冷靜一下。有沒有受傷？我們一件一件確認。","en-US":"Stay calm. Are you hurt? Let's check one thing at a time."}},
  aoi: {voice:"Aoede", description:"爽朗有力・乾脆直接", direction:"年輕女性，聲音結實明亮，語速略快，句尾乾脆；保護隊友時堅定，不持續吼叫。", samples:{"ja-JP":"大丈夫？ よかった。私が前に出るから、ついてきて！","zh-TW":"你沒事吧？太好了。我走前面，跟緊我！","en-US":"You okay? Good. I'll take the lead. Stay close!"}},
  ren: {voice:"Puck", description:"清亮敏捷・好奇心旺盛", direction:"年輕男性，清亮靈活，語速偏快，發現線索時興奮；術語清楚，思考時短暫停頓，不裝腔。", samples:{"ja-JP":"待って、今の変化、測れるかもしれない。もう一度確かめよう！","zh-TW":"等一下，剛剛的變化或許可以量測。我們再確認一次！","en-US":"Wait, we might be able to measure that change. Let's check again!"}},
  chinatsu: {voice:"Leda", description:"安靜細膩・輕柔留白", direction:"年輕女性，輕柔內斂，語速稍慢，短句間自然留白。害羞但吐字清楚，不耳語、不刻意氣音。", samples:{"ja-JP":"……ここ、見て。この線だけ、つながってない。描いてみるね。","zh-TW":"……你看這裡。只有這條線沒有接上。我畫給你看。","en-US":"Look here. This line doesn't connect. Let me draw it for you."}},
  takumi: {voice:"Charon", description:"低穩克制・簡短可靠", direction:"年輕男性，中低音，沉著節制，語速中慢，像可靠隊友簡短提醒；不用軍官吼令或老年沙啞聲。", samples:{"ja-JP":"靴ひも、ほどけてる。結び直してから行こう。道は確認した。","zh-TW":"你的鞋帶鬆了。綁好再走。路線我確認過了。","en-US":"Your shoelace is loose. Tie it before we move. I've checked the route."}},
  miwa: {voice:"Despina", description:"柔和安定・溫柔而堅定", direction:"年輕女性，柔和平順，中慢語速，先安撫再提醒；要求休息時溫柔堅定，不幼兒化、不過度甜膩。", samples:{"ja-JP":"少し座って。無理しなくていいよ。傷を見せてもらえる？","zh-TW":"先坐一下。不用勉強自己，可以讓我看看傷口嗎？","en-US":"Sit down for a moment. You don't have to push yourself. May I check your wound?"}},
  sho: {voice:"Fenrir", description:"明朗熱血・開闊有活力", direction:"年輕男性，明亮有力，說話開闊，略快且帶笑意；進入警戒時收斂、集中，不每句都喊。", samples:{"ja-JP":"よし、任せて！ みんなのところまで、一緒に戻ろう。","zh-TW":"好，交給我！我們一起回大家那邊。","en-US":"All right, leave it to me! Let's get back to the others together."}},
  rina: {voice:"Erinome", description:"清冷俐落・帶鋒芒的機敏", direction:"年輕女性，中低音感，俐落稍快，帶輕微揶揄與警覺；真心關心時放低音量，不誘惑、不尖叫。", samples:{"ja-JP":"しっ、振り向かないで。ゆっくりこっちに来て。足音、大きすぎ。","zh-TW":"噓，別回頭。慢慢走過來。你的腳步聲太大了。","en-US":"Shh. Don't turn around. Come here slowly. Your footsteps are way too loud."}},
  yota: {voice:"Iapetus", description:"清秀輕聲・靦腆而敏銳", direction:"年輕男性，清秀偏輕，起句略猶豫，只在文字本身有停頓時輕頓；預警時清楚急切，不誇張結巴。", samples:{"ja-JP":"あの、少し静かにして。……東のほう、何か聞こえる。","zh-TW":"那個，先安靜一下。……東邊，好像有什麼聲音。","en-US":"Um, could we be quiet for a moment? I can hear something to the east."}},
  toru: {voice:"Umbriel", description:"溫厚從容・像一碗熱湯", direction:"年輕男性，溫厚圓潤，語速稍慢，淡淡笑意，句尾柔和，耐心且親切；不使用老年或說教口吻。", samples:{"ja-JP":"温かいの、できたよ。急がなくていいから、ゆっくり食べて。","zh-TW":"熱的煮好了。不用急，慢慢吃。","en-US":"Something warm is ready. There's no rush. Take your time."}},
};
export function companionVoiceSettings(c: {official_key?:string|null;voice_name?:string|null;speech_language?:string|null}) {
  const casting = c.official_key ? OFFICIAL_VOICES[c.official_key] : undefined;
  const language = isCompanionLanguage(c.speech_language) ? c.speech_language : casting ? "ja-JP" : "zh-TW";
  return { language, voiceName:isVoice(c.voice_name) ? c.voice_name : casting?.voice ?? resolveVoice(null), casting };
}
export function companionLanguagePrompt(language: CompanionLanguage) {
  return `本輪對話語言：${COMPANION_LANGUAGES.find(l=>l.id===language)!.instruction}角色台詞、動作敘述與建議回覆均使用此語言；保留 JSON 欄位名稱、角色身分與性格。舊對話的語言不代表本輪語言。`;
}
export function companionSpeechDirection(c:Parameters<typeof companionVoiceSettings>[0], language:CompanionLanguage) {
  const {casting}=companionVoiceSettings(c);
  return `${casting?.direction ?? "自然清晰，像日常交談。"}${COMPANION_LANGUAGES.find(l=>l.id===language)!.instruction}只朗讀原文，不加台詞、音效或配樂。`;
}
