/** Shared client/server relationship thresholds. No database or provider imports. */
export interface AffectionLevel {
  min: number;
  name: string;
  unlock: string;
}

export const AFFECTION_LEVELS: AffectionLevel[] = [
  { min: 0, name: "初次見面", unlock: "禮貌友善地認識彼此，保持合適距離" },
  { min: 20, name: "漸漸熟悉", unlock: "分享生活小事，交流更輕鬆自然" },
  { min: 40, name: "曖昧升溫", unlock: "在彼此同意與關係設定允許下，表達含蓄的心動" },
  { min: 60, name: "戀人未滿", unlock: "溫柔關懷與浪漫互動，尊重彼此界線" },
  { min: 80, name: "熱戀時刻", unlock: "更深入分享情感，以非露骨方式表達愛意" },
  { min: 100, name: "靈魂伴侶", unlock: "深厚信任與真誠陪伴，仍保有同意與界線" },
];

/**
 * The all_ages ladder — same thresholds, but it measures trust between
 * squad-mates, never romance. Used for every character whose content_rating
 * is all_ages (the under-18 官方角色); see lib/characters.ts contentRules.
 */
export const TRUST_LEVELS: AffectionLevel[] = [
  { min: 0, name: "初次相遇", unlock: "剛認識的同學，禮貌但有點生疏" },
  { min: 20, name: "同隊夥伴", unlock: "願意一起行動，開始分享自己的想法" },
  { min: 40, name: "信賴的隊友", unlock: "會把重要的判斷交給你，聊得更放鬆" },
  { min: 60, name: "並肩作戰", unlock: "彼此掩護的默契，願意說出害怕的事" },
  { min: 80, name: "生死之交", unlock: "毫無保留的信任，會為你冒險" },
  { min: 100, name: "摯友", unlock: "回到現實世界也想繼續當朋友的人" },
];

export type LadderKind = "romance" | "trust";

export function ladderFor(kind: LadderKind): AffectionLevel[] {
  return kind === "trust" ? TRUST_LEVELS : AFFECTION_LEVELS;
}

export interface LevelInfo {
  index: number;
  name: string;
  unlock: string;
  min: number;
  nextMin: number | null;
  /** 0-100 progress toward nextMin; 100 when already at the top level */
  progressPct: number;
}

export function levelInfo(affection: number, kind: LadderKind = "romance"): LevelInfo {
  const levels = ladderFor(kind);
  let idx = 0;
  for (let i = 0; i < levels.length; i++) {
    if (affection >= levels[i].min) idx = i;
  }
  const cur = levels[idx];
  const next = levels[idx + 1] ?? null;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((affection - cur.min) / (next.min - cur.min)) * 100)))
    : 100;
  return { index: idx, name: cur.name, unlock: cur.unlock, min: cur.min, nextMin: next?.min ?? null, progressPct };
}

