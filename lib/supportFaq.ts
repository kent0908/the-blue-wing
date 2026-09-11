/**
 * 客服助手的 QA 題庫 — 單一內容來源，同時餵給兩個地方：
 *   1. components/SupportChat.tsx（"use client"）直接渲染成可點選的問答清單。
 *   2. app/api/support-chat/route.ts 把整包題庫組進 LLM 的 system prompt，
 *      當作免費問答問不到、或使用者直接打字問問題時的依據——比原本手寫一段
 *      籠統的系統提示準確，而且兩邊看到的資訊保證一致，不會各講各的。
 *
 * 這個檔案本身刻意保持零相依（只從同樣零相依的 lib/plans.ts、
 * lib/creditPacks.ts、lib/companionConstants.ts 讀資料），因為它會被"use
 * client" 元件直接 import——牽到任何用了 @vercel/postgres／@vercel/blob 的
 * server-only 檔案，client bundle 就會炸掉或夾帶不該給瀏覽器看到的東西。
 * 儲值金額、訂閱方案、換裝費用、好感度階段這些會隨設定變動的數字，一律用
 * import 進來的常數動態組字串，不手key數字——這樣哪天價格表改了，這裡的
 * FAQ 內容會自動跟著對，不用另外手動維護一份重複的數字。
 */
import { PLANS } from "./plans";
import { CREDIT_PACKS, CREDIT_PACK_EXPIRY_DAYS } from "./creditPacks";
import { AFFECTION_LEVELS, OUTFIT_CHANGE_COST, OUTFIT_UNLOCK_LEVEL_INDEX } from "./companionConstants";

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface FaqCategory {
  id: string;
  label: string;
  entries: FaqEntry[];
}

const outfitUnlockLevel = AFFECTION_LEVELS[OUTFIT_UNLOCK_LEVEL_INDEX];
const affectionLadder = AFFECTION_LEVELS.map((l) => `${l.name}（好感度 ${l.min}）`).join("、");
const packLines = CREDIT_PACKS.map((p) => `${p.credits.toLocaleString("zh-TW")} 點（$${p.priceUSD}）`).join("、");
const planLines = PLANS.filter((p) => p.priceUSD > 0)
  .map((p) => `${p.name}（$${p.priceUSD}/月，${p.monthlyCredits.toLocaleString("zh-TW")} 點）`)
  .join("、");
const packExpiryYears = Math.round(CREDIT_PACK_EXPIRY_DAYS / 365);

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "models",
    label: "圖片與影片模型",
    entries: [
      {
        question: "平台支援哪些圖片/影片生成模型？",
        answer:
          "圖片有 Seedream 系列（4.0/4.5/5.0 pro 等）、Gemini 系列、GPT-Image-2 等；影片有 Seedance 系列（1.0 pro/pro fast、1.5 pro、2.0/2.0 fast/2.0 mini、2.5）跟 Veo 等。實際可選清單以生成頁面的模型選單為準，管理員會持續調整上下架的模型。",
      },
      {
        question: "每個模型可以選的解析度、秒數都一樣嗎？",
        answer:
          "不一樣，每個模型實際支援的解析度跟最長秒數都不同（例如某些 Seedance 版本最長只到 12–15 秒、某些到 30 秒；4K 只有特定版本支援）。選好模型之後，設定面板只會顯示這個模型真的支援的選項，不會出現選了會失敗的組合。",
      },
      {
        question: "可以用參考圖生成類似風格/角色的圖片或影片嗎？",
        answer:
          "可以，在輸入框旁點「+ 素材」附上參考圖，可以來自資產庫，也可以是智慧畫布裡其他節點的輸出。要注意不是每個模型都支援參考圖——Seedance 1.0-pro / 1.0-pro-fast / 1.5-pro 目前不支援附帶參考圖，2.0（含 mini/fast）與 2.5 才支援。",
      },
      {
        question: "生成的圖片/影片會有「AI 生成」浮水印嗎？",
        answer: "平台預設一律關閉浮水印。",
      },
      {
        question: "有 NSFW（成人）版本的模型嗎？",
        answer:
          "部分模型有 NSFW 版本（模型名稱會帶 NSFW- 前綴），用來解鎖更開放尺度的內容——例如陪聊角色到達特定好感度階段後的專屬場景與換裝功能，就會自動切換使用 NSFW 模型。功能與安全版本相同，差別只在內容尺度。",
      },
      {
        question: "提交影片生成後要等多久？",
        answer:
          "影片生成是非同步的，提交後會先拿到一個任務編號，系統會在背景持續查詢進度，通常幾十秒到幾分鐘不等（依模型與長度而定），完成後自動出現在生成紀錄。如果最終失敗，扣的點數會自動退還。",
      },
    ],
  },
  {
    id: "canvas",
    label: "智慧畫布",
    entries: [
      {
        question: "智慧畫布是什麼？",
        answer:
          "把文字、圖片生成、影片生成、讀取素材、3D 導演台這五種節點拉在同一個畫面上，自由串接成你自己的工作流——例如「文字節點 → 圖片生成節點 → 影片生成節點」，一路把前一步的結果餵給下一步。",
      },
      {
        question: "官方模板跟藍翼廣場是什麼？",
        answer:
          "兩個都是「別人已經搭好的畫布，可以直接複製一份來用」。官方模板是管理員精選發布的；藍翼廣場則是任何使用者都能把自己搭好的畫布分享出來，也能看到被複製過幾次。複製之後是完全獨立的一份，改動不會影響原作者。",
      },
      {
        question: "複製別人分享的畫布，裡面的參考圖片會一起帶過來嗎？",
        answer:
          "不會。如果原本的節點引用的是分享者自己資產庫裡的私人圖片，複製到你的帳號後那張圖會讀不到（資產庫本來就只有本人看得到），需要自己重新選一張參考圖。畫布的價值主要在節點的串接方式跟 prompt，不是那張圖本身。",
      },
      {
        question: "目前畫布還不支援哪些功能？",
        answer: "圖層合成、字型、錄音配音、讓 Agent 呼叫其他節點當工具，這些目前還沒有對應的真實 API 可以接，所以還沒有做。",
      },
    ],
  },
  {
    id: "director3d",
    label: "3D 導演台",
    entries: [
      {
        question: "3D 導演台可以做什麼？",
        answer:
          "在 3D 場景裡擺放、調整角色姿勢跟鏡位，截圖後可以直接送去圖片/影片生成當參考。有「精細模特兒」跟「簡易關節人偶」兩種角色體型可切換，也有一鍵運鏡按鈕（正面/側面/背面/俯視/仰視/特寫等常用鏡位），方便不熟悉 3D 操作的人快速取景。",
      },
      {
        question: "需要先建立畫布才能用 3D 導演台嗎？",
        answer: "不用，3D 導演台有自己的獨立頁面，可以直接開來擺姿勢、截圖，完全不用先建立一個畫布。",
      },
      {
        question: "怎麼讓角色在場景裡移動？",
        answer:
          "選好角色後到右邊「路徑」分頁，按「點擊放置路徑點」，然後在地面依序點出路線——每點一下就多一個路徑點，時間會自動接續（間隔秒數可改），也可以指定每個點的姿勢。放好的點可以點選、拖曳微調；播放時角色會自動轉向前進方向、轉彎走平滑曲線。按 Esc 結束放置模式。",
      },
      {
        question: "運鏡（鏡頭移動）要怎麼設定？",
        answer:
          "右邊「鏡頭」分頁有兩種方式：一是點運鏡模板（推鏡、拉鏡、左右環繞、360°、升降、搖鏡、橫移、弧形推近、跟拍、定點跟蹤），系統會從你目前的視角出發、以選中的角色為主體自動產生整段運鏡；二是手動關鍵影格：把時間軸拖到某一秒、擺好視角、按「記成影格」，重複幾次，影格之間會自動平滑過渡。畫面下方的時間軸可以拖曳預覽任一秒的畫面，按 ▶ 可以完整播一次。",
      },
      {
        question: "可以錄製運鏡動畫嗎？時長怎麼選？",
        answer: "可以，錄製時長 1–30 秒自由選擇，錄製時鏡頭會自動照「鏡頭」分頁設定的軌道跑、角色也會照路徑走（沒設定軌道的話就是錄你手動拖曳的畫面），錄好後真的會存成一支可下載、可預覽的影片檔。",
      },
      {
        question: "錄好的運鏡可以直接拿去生成影片嗎？",
        answer:
          "可以一鍵送去影片生成：這段錄製會被當成「運鏡參考影片」，同時系統會自動抽出幾張畫面當多重參考圖、加上自動判讀的運鏡文字提示，三者一起送出。這個功能目前只有 Seedance 2.0 / 2.5 這兩個版本真正支援，選其他模型時系統會自動退回只使用畫面。",
      },
      {
        question: "支援多相機或 360 度背景嗎？",
        answer: "目前還沒有，只有單一自由視角相機跟純色背景，多相機同時運作、360° 全景背景還在後續開發中。",
      },
    ],
  },
  {
    id: "editor",
    label: "圖層編輯",
    entries: [
      {
        question: "圖層編輯是做什麼的？",
        answer:
          "多圖層合成畫布，可以疊加多張圖片（從資產庫加入或直接上傳）、自由拖曳縮放排版、調整圖層順序跟顯示/隱藏，排好之後可以直接送去 AI 生成/融合成一張新圖。",
      },
      {
        question: "可以只修改圖片裡的某個小地方嗎？",
        answer: "可以，用「局部重繪」：先用畫筆圈出想修改的區域，系統只會針對圈選範圍重新生成，其他地方保持不變。",
      },
      {
        question: "局部重繪跟 AI 生成/融合有什麼不同？",
        answer: "AI 生成/融合是把整個圖層畫面攤平後整張重新生成；局部重繪則是精確只改圈出來的那一小塊區域，其餘保持原樣。",
      },
    ],
  },
  {
    id: "assets",
    label: "資產庫",
    entries: [
      {
        question: "資產庫是什麼？",
        answer:
          "自己的私人素材圖片庫，上傳的圖片只有自己看得到，可以在圖片生成、影片生成、陪聊角色頭像、智慧畫布的讀取素材節點等地方，當作參考圖重複使用。",
      },
      {
        question: "資產庫裡的圖片會被別人看到或用到嗎？",
        answer: "不會，資產庫是私人的，其他使用者（包含被分享到藍翼廣場的畫布）都無法讀取你的資產庫圖片。",
      },
    ],
  },
  {
    id: "companion",
    label: "陪聊角色",
    entries: [
      {
        question: "怎麼建立一個陪聊角色？",
        answer:
          "從資產庫挑一張圖當頭像，設定名字、人設、外觀等細項就可以開始聊天。角色建立好後，如果這個月的免費待機影片額度還沒用掉，系統會自動免費生成一支待機影片。",
      },
      {
        question: "好感度怎麼提升？分幾個階段？",
        answer: `每聊一則訊息 +1 好感度，聊到角色設定的「喜好」話題會額外加成。分成六個階段：${affectionLadder}，好感度不夠不會有大尺度對話，每個階段角色的說話語氣跟能聊的話題深度都不一樣。`,
      },
      {
        question: "待機影片是什麼？可以重新生成嗎？",
        answer: "聊天畫面裡角色的循環播放短片。每個帳號每個月有一次免費生成機會；額度用完後想重新生成，需要花點數，實際費用會直接顯示在按鈕上。",
      },
      {
        question: "換裝衣櫃是什麼？",
        answer: `好感度到「${outfitUnlockLevel.name}」（${outfitUnlockLevel.min}）以上才會解鎖，花 ${OUTFIT_CHANGE_COST} 點可以幫角色換上指定服裝（水手服、女僕裝、晚禮服等十套），會重新生成一支穿著新服裝的待機影片，每次購買附一次免費的重新生成機會。`,
      },
      {
        question: "解鎖場景是什麼？",
        answer: "隨好感度提升可以生成角色專屬的圖片或影片留念，畫面內容也會隨好感度階段從溫馨日常逐漸轉向親密——這是最高階方案的專屬功能。",
      },
    ],
  },
  {
    id: "topup",
    label: "儲值金額",
    entries: [
      {
        question: "目前有哪些點數包可以買？",
        answer: `${packLines}——買越多單價越便宜。`,
      },
      {
        question: "點數包買了之後多久會過期？",
        answer: `從入帳那天起算，${packExpiryYears} 年（${CREDIT_PACK_EXPIRY_DAYS} 天）內都可以使用，不綁任何月費週期。`,
      },
      {
        question: "現在可以直接刷卡購買嗎？",
        answer: "目前金流還沒有正式串接開放，付費方案跟點數包都要先聯絡管理員手動開通。",
      },
    ],
  },
  {
    id: "subscription",
    label: "訂閱與點數時間計算",
    entries: [
      {
        question: "免費方案每天可以用多少點數？",
        answer: `每天 ${PLANS[0].dailyCredits} 點，帳號一註冊完成就會拿到，每天重新補滿一次，當天沒用完不會累積到隔天。`,
      },
      {
        question: "付費方案的點數什麼時候發放、什麼時候到期？",
        answer:
          "開通當下立即發放整個週期的點數，效期是「開通日起算 30 天」，跟這次續訂的到期時間完全同步——這個週期沒用完的點數，會在滿 30 天的那一刻直接失效，不會累積到下一期。",
      },
      {
        question: "方案會自動續訂扣款嗎？",
        answer: "目前還沒有，因為金流尚未正式開通，每次續訂都需要管理員手動重新開通，還不是自動扣款續訂的形式。",
      },
      {
        question: "有哪些付費方案？差異在哪？",
        answer: `${planLines}。最高階方案額外解鎖陪聊角色的專屬解鎖場景功能。`,
      },
    ],
  },
];

/** Flattened plain-text version fed into the support LLM's system prompt. */
export function faqAsPlainText(): string {
  return FAQ_CATEGORIES.map(
    (c) => `【${c.label}】\n` + c.entries.map((e) => `Q: ${e.question}\nA: ${e.answer}`).join("\n")
  ).join("\n\n");
}
