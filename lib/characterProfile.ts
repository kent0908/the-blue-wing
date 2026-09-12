/** Shared, bounded character settings. Free text is character data, never API configuration. */
export const PROFILE_FIELDS = {
  gender: { label: "性別", max: 30, options: ["女性", "男性", "非二元", "自訂"] },
  style: { label: "視覺風格", max: 30, options: ["寫實", "動漫", "電影感", "繪本"] },
  species: { label: "角色類型", max: 60, options: ["人類", "精靈", "機器人", "奇幻角色"] },
  skin: { label: "膚色", max: 40, options: ["白皙", "自然", "小麥", "古銅", "深棕"] },
  hair: { label: "髮型與髮色", max: 100 },
  eyes: { label: "眼睛顏色", max: 40 },
  build: { label: "體型", max: 40, options: ["纖細", "勻稱", "健美", "豐滿", "高挑"] },
  outfit: { label: "服裝與外觀細節", max: 300 },
  temperament: { label: "性格", max: 100, options: ["溫柔體貼", "開朗幽默", "沉穩理性", "活潑好奇", "內斂細膩"] },
  speaking: { label: "說話方式", max: 100, options: ["自然簡短", "溫柔細膩", "幽默俏皮", "知性條理", "故事感"] },
  occupation: { label: "職業", max: 100, options: ["藝術家", "設計師", "音樂人", "工程師", "作家", "旅行家"] },
  relationship: { label: "你們的關係", max: 100, options: ["新朋友", "好友", "戀人", "同事", "室友", "冒險夥伴"] },
  greeting: { label: "開場白", max: 600 },
  scenario: { label: "相遇情境", max: 800 },
  background: { label: "背景故事", max: 1000 },
  boundaries: { label: "互動偏好與界線", max: 400 },
  tags: { label: "管理標籤", max: 200 },
} as const;
export type ProfileKey = keyof typeof PROFILE_FIELDS;
export type CharacterProfile = Record<ProfileKey, string> & { version: 1; age: number };
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
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("角色設定格式不正確");
  const input = value as Record<string, unknown>;
  if (input.version !== undefined && input.version !== 1) throw new Error("角色設定版本不支援");
  const age = input.age ?? 25;
  if (typeof age !== "number" || !Number.isInteger(age) || age < minAge || age > 120) throw new Error(`角色年齡請填寫 ${minAge} 至 120 歲`);
  const result = { ...EMPTY_PROFILE, age };
  for (const key of Object.keys(PROFILE_FIELDS) as ProfileKey[]) {
    const text = input[key] ?? "";
    if (typeof text !== "string" || text.length > PROFILE_FIELDS[key].max) throw new Error(`${PROFILE_FIELDS[key].label}格式或長度不正確`);
    result[key] = text.trim();
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
  return [ageLine, ...keys.filter(k => p[k]).map(k => `${PROFILE_FIELDS[k].label}：${p[k]}`)].join("\n");
}
