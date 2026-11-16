import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";

const zh = {
  starter: "套用三段劇本大綱", shotAdvice: "依敘事目的選鏡位",
  story: "【開場】交代誰、在哪裡，以及一件不尋常的事。用可拍的動作開場。\n\n【轉折】人物遇到阻力並作出選擇。安排一個動作或道具，讓觀眾看見變化。\n\n【收尾】拍出選擇的後果。留一個反應或未解問題，作為切點。",
  draftOnly: "依段落新增分鏡草稿，保留現有鏡頭。",
  reviewShot: "審閱並生成這一鏡",
  world: "交代空間", worldCamera: "平視固定全景，24–35mm。保留人物與出口、道具的相對位置，讓下一鏡有清楚的方向。",
  reaction: "捕捉反應", reactionCamera: "平視近景，65–85mm。留出視線方向的空間，事件發生後停半拍再切。",
  dialogue: "交代對話關係", dialogueCamera: "過肩中近景，50mm，保持鏡頭在同一側軸線。切反打時對齊視線高度。",
  reveal: "揭露關鍵細節", revealCamera: "固定特寫，85mm。讓手部或道具進入畫面，在動作完成時切到下一鏡。",
  follow: "跟上角色移動", followCamera: "側向跟拍中景，35–50mm。保持移動方向與速度，在相同動作上銜接下一鏡。",
};
type Copy = typeof zh;
const en: Copy = {
  starter: "Use a three-beat outline", shotAdvice: "Framing by story purpose",
  story: "[Opening] Establish who is here, where they are, and one thing out of place. Start with an action you can film.\n\n[Turn] Give the character an obstacle and a choice. Make the change visible through a gesture or a prop.\n\n[Ending] Show the consequence of the choice. Hold on a reaction or an open question before cutting.",
  draftOnly: "Create draft shots from the paragraphs and keep the existing shots.",
  reviewShot: "Review and generate shot",
  world: "Establish geography", worldCamera: "Locked eye-level wide shot, 24–35mm. Keep the subject, exit, and props in relation so the next cut has a clear direction.",
  reaction: "Catch a reaction", reactionCamera: "Eye-level close-up, 65–85mm. Leave room in the direction of the gaze and hold half a beat after the event.",
  dialogue: "Stage a dialogue", dialogueCamera: "Over-the-shoulder medium close-up, 50mm. Stay on one side of the action and match eyelines on the reverse.",
  reveal: "Reveal a detail", revealCamera: "Locked close-up, 85mm. Let the hand or prop enter the shot and cut as the action completes.",
  follow: "Follow movement", followCamera: "Lateral tracking medium shot, 35–50mm. Maintain screen direction and pace, then cut on the same action.",
};
const ja: Copy = {
  starter: "三段構成のひな型を使う", shotAdvice: "演出の目的から画角を選ぶ",
  story: "【導入】誰がどこにいるか、何がいつもと違うかを撮れる動作で示す。\n\n【転換】人物が障害に出会い、選択する。仕草や小道具で変化を見せる。\n\n【結末】選択の結果を描く。反応や次への問いを残してカットする。",
  draftOnly: "段落ごとにショットの下書きを追加し、既存のショットは残します。",
  reviewShot: "設定を確認してこのショットを生成",
  world: "空間を伝える", worldCamera: "目線の高さで固定のワイド、24–35mm。人物、出口、小道具の位置関係を見せ、次のカットの方向を明確にする。",
  reaction: "反応を捉える", reactionCamera: "目線の高さでクローズアップ、65–85mm。視線の先を空け、出来事のあと半拍置いて切る。",
  dialogue: "会話の関係を見せる", dialogueCamera: "肩越しのミディアムクローズアップ、50mm。軸線の同じ側に留まり、切り返しの視線の高さを合わせる。",
  reveal: "手がかりを見せる", revealCamera: "固定のクローズアップ、85mm。手や小道具を画面に入れ、動作が終わるところで切る。",
  follow: "移動についていく", followCamera: "横移動のミディアム、35–50mm。画面内の方向と速度を保ち、同じ動作で次のカットにつなぐ。",
};
const copies: Record<Locale, Copy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export const dramaPlanningCopy = (locale: Locale) => copies[locale];
