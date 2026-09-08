/**
 * Plain, dependency-free data shared between server logic
 * (lib/characters.ts, lib/characterOutfits.ts) and anything that needs the
 * SAME numbers from CLIENT code (e.g. lib/supportFaq.ts, rendered inside a
 * "use client" component). Those two lib files pull in @vercel/postgres /
 * @vercel/blob at module scope — importing anything from them into client
 * code would drag that server-only code into the browser bundle. Keeping
 * the actual data here (and having the server files import it FROM here,
 * re-exporting under their original names) keeps one source of truth
 * without that problem.
 */

export interface AffectionLevel {
  min: number;
  name: string;
  unlock: string;
}

// 2026-09-07 重新設計：0/20/40/60/80/100 六個階段——見 lib/characters.ts 的
// buildSystemPrompt／SCENE_PROMPTS 註解，這裡只放資料本身。
export const AFFECTION_LEVELS: AffectionLevel[] = [
  { min: 0, name: "初次見面", unlock: "剛認識，禮貌友善地聊興趣話題，完全不談情說愛" },
  { min: 20, name: "漸漸熟悉", unlock: "開始主動分享生活小事，語氣更輕鬆自在" },
  { min: 40, name: "曖昧升溫", unlock: "偶爾害羞的曖昧氛圍，會在意你怎麼看她/他" },
  { min: 60, name: "戀人未滿", unlock: "明確的心動與親密感，會撒嬌、吃醋，對話帶點浪漫張力" },
  { min: 80, name: "熱戀時刻", unlock: "熱戀般親密的互動，願意聊更私密的情感與身體感受" },
  { min: 100, name: "靈魂伴侶", unlock: "完全卸下心防，最真實親密的一面，不再設限" },
];

/** 換裝衣櫃單次花費（lib/characterOutfits.ts）。 */
export const OUTFIT_CHANGE_COST = 500;
/** 換裝衣櫃解鎖門檻——AFFECTION_LEVELS 的 index（4 = 熱戀時刻，好感度 80）。 */
export const OUTFIT_UNLOCK_LEVEL_INDEX = 4;
