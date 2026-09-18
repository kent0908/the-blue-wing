import { k } from "./i18n/k";
/** Shared, bounded character settings. Free text is character data, never API configuration. */
export const PROFILE_FIELDS = {
  gender: { label: k("性別"), max: 30, options: [k("女性"), k("男性"), k("非二元"), k("自訂")] },
  style: { label: k("視覺風格"), max: 30, options: [k("寫實"), k("動漫"), k("電影感"), k("繪本")] },
  species: { label: k("角色類型"), max: 60, options: [k("人類"), k("精靈"), k("機器人"), k("奇幻角色")] },
  skin: { label: k("膚色"), max: 40, options: [k("白皙"), k("自然"), k("小麥"), k("古銅"), k("深棕")] },
  hair: { label: k("髮型與髮色"), max: 100 },
  eyes: { label: k("眼睛顏色"), max: 40 },
  build: { label: k("體型"), max: 40, options: [k("纖細"), k("勻稱"), k("健美"), k("豐滿"), k("高挑")] },
  outfit: { label: k("服裝與外觀細節"), max: 300 },
  temperament: { label: k("性格"), max: 100, options: [k("溫柔體貼"), k("開朗幽默"), k("沉穩理性"), k("活潑好奇"), k("內斂細膩")] },
  speaking: { label: k("說話方式"), max: 100, options: [k("自然簡短"), k("溫柔細膩"), k("幽默俏皮"), k("知性條理"), k("故事感")] },
  occupation: { label: k("職業"), max: 100, options: [k("藝術家"), k("設計師"), k("音樂人"), k("工程師"), k("作家"), k("旅行家")] },
  relationship: { label: k("你們的關係"), max: 100, options: [k("新朋友"), k("好友"), k("戀人"), k("同事"), k("室友"), k("冒險夥伴")] },
  greeting: { label: k("開場白"), max: 600 },
  scenario: { label: k("相遇情境"), max: 800 },
  background: { label: k("背景故事"), max: 1000 },
  boundaries: { label: k("互動偏好與界線"), max: 400 },
  tags: { label: k("管理標籤"), max: 200 },
} as const;
export type ProfileKey = keyof typeof PROFILE_FIELDS;
export const RELATIONSHIP_FIELDS = { affectionStyle: "情感表達方式", petNames: "親暱稱呼", dailyHabits: "相處習慣", conflictStyle: "衝突處理方式", hopes: "關係期待與發展方向", sharedHistory: "已建立的共同經歷" } as const;
export type RelationshipSettings = Partial<Record<keyof typeof RELATIONSHIP_FIELDS, string>>;
export interface AvatarCrop { x: number; y: number; zoom: number }
export type CharacterProfile = Record<ProfileKey, string> & { version: 1; age: number; avatarCrop?: AvatarCrop; relationshipSettings?: RelationshipSettings };
export const EMPTY_PROFILE: CharacterProfile = {
  version: 1, age: 25, gender: "", style: "", species: "", skin: "", hair: "", eyes: "", build: "", outfit: "",
  temperament: "", speaking: "", occupation: "", relationship: "", greeting: "", scenario: "", background: "", boundaries: "", tags: "",
};
/**
 * `minAge` is 18 for everything a user creates or edits (the API routes and
 * CharacterBuilder both pin it). The only lower value in the codebase is
 * OFFICIAL_MIN_AGE, used for the platform's own 官方角色 whose canonical ages
 * are 16–18 — and those rows are content-rated all_ages below 18 (see
 * lib/companionOfficialSeed.ts / lib/characters.ts contentRules), so the
 * relaxed age never reaches the romantic ladder or any NSFW path.
 */
export const OFFICIAL_MIN_AGE = 16;

export function validateProfile(value: unknown, minAge = 18): CharacterProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(k("角色設定格式不正確"));
  const input = value as Record<string, unknown>;
  if (input.version !== undefined && input.version !== 1) throw new Error(k("角色設定版本不支援"));
  const age = input.age ?? 25;
  if (typeof age !== "number" || !Number.isInteger(age) || age < minAge || age > 120) throw new Error(`角色年齡請填寫 ${minAge} 至 120 歲`);
  const result = { ...EMPTY_PROFILE, age };
  for (const key of Object.keys(PROFILE_FIELDS) as ProfileKey[]) {
    const text = input[key] ?? "";
    if (typeof text !== "string" || text.length > PROFILE_FIELDS[key].max) throw new Error(`${PROFILE_FIELDS[key].label}格式或長度不正確`);
    result[key] = text.trim();
  }
  if (input.avatarCrop !== undefined) {
    const crop = input.avatarCrop as AvatarCrop;
    if (!crop || typeof crop !== "object" || ![crop.x, crop.y, crop.zoom].every(v => typeof v === "number" && Number.isFinite(v)) || Math.abs(crop.x) > 300 || Math.abs(crop.y) > 300 || crop.zoom < 1 || crop.zoom > 8) throw new Error("頭像裁切設定不正確");
    result.avatarCrop = { x: crop.x, y: crop.y, zoom: crop.zoom };
  }
  if (input.relationshipSettings !== undefined) {
    if (!input.relationshipSettings || typeof input.relationshipSettings !== "object" || Array.isArray(input.relationshipSettings)) throw new Error("相處設定格式不正確");
    result.relationshipSettings = {};
    for (const key of Object.keys(RELATIONSHIP_FIELDS) as (keyof RelationshipSettings)[]) {
      const text = (input.relationshipSettings as Record<string, unknown>)[key] ?? "";
      if (typeof text !== "string" || text.length > 500) throw new Error("相處設定每項最多500字");
      result.relationshipSettings[key] = text.trim();
    }
  }
  return result;
}
/** Storage → display: tolerant of the official rows' canonical ages (see OFFICIAL_MIN_AGE). Never used to accept user input. */
export function readProfile(value: unknown): CharacterProfile {
  try { return validateProfile(value, OFFICIAL_MIN_AGE); } catch { return { ...EMPTY_PROFILE }; }
}
export function profilePrompt(value: unknown, appearanceOnly = false): string {
  const p = readProfile(value);
  const keys: ProfileKey[] = appearanceOnly
    ? ["gender", "style", "species", "skin", "hair", "eyes", "build", "outfit", "scenario"]
    : (Object.keys(PROFILE_FIELDS) as ProfileKey[]).filter(k => k !== "tags");
  const ageLine = p.age >= 18 ? `成年角色，${p.age} 歲` : `${p.age} 歲的學生角色（全年齡設定：只有友誼與夥伴互動）`;
  return [ageLine, ...(!appearanceOnly ? Object.entries(p.relationshipSettings ?? {}).filter(([,v]) => v).map(([key,v]) => `${RELATIONSHIP_FIELDS[key as keyof RelationshipSettings]}：${v}`) : []), ...keys.filter(k => p[k]).map(k => `${PROFILE_FIELDS[k].label}：${p[k]}`)].join("\n");
}
