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

export interface LevelInfo {
  index: number;
  name: string;
  unlock: string;
  min: number;
  nextMin: number | null;
  /** 0-100 progress toward nextMin; 100 when already at the top level */
  progressPct: number;
}

export function levelInfo(affection: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < AFFECTION_LEVELS.length; i++) {
    if (affection >= AFFECTION_LEVELS[i].min) idx = i;
  }
  const cur = AFFECTION_LEVELS[idx];
  const next = AFFECTION_LEVELS[idx + 1] ?? null;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((affection - cur.min) / (next.min - cur.min)) * 100)))
    : 100;
  return { index: idx, name: cur.name, unlock: cur.unlock, min: cur.min, nextMin: next?.min ?? null, progressPct };
}

