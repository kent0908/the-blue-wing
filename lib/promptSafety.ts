/**
 * First-layer product policy for user-supplied generation text.
 * This deliberately blocks the listed topics even in negations or educational
 * requests. It is a keyword gate, NOT semantic moderation or image inspection.
 * Apply to user text / character context before adding trusted negative prompts,
 * before credit reservation and before calling any generation provider.
 */
export type PromptSafetyCategory = "minors" | "drugs";
export const PROMPT_BLOCKED_MESSAGE = "提示詞含有未開放的兒童、未成年人或毒品相關內容，請修改後再試。此次未進行生成或扣點。";

export type PromptSafetyResult =
  | { allowed: true }
  | { allowed: false; category: PromptSafetyCategory; code: "prompt_blocked"; message: string };

const invisible = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;
const chineseTerms: Record<PromptSafetyCategory, readonly string[]> = {
  minors: ["兒童", "儿童", "小孩", "孩童", "幼童", "男童", "女童", "幼女", "幼兒", "幼儿", "嬰兒", "婴儿", "未成年", "未滿十八", "未满十八", "未滿18", "未满18", "少年", "少女", "小學生", "小学生", "國中生", "国中生", "中學生", "中学生", "高中生", "初中生", "幼稚園", "幼稚园", "幼兒園", "幼儿园", "蘿莉", "萝莉", "正太"],
  drugs: ["毒品", "吸毒", "販毒", "贩毒", "製毒", "制毒", "大麻", "海洛因", "古柯鹼", "古柯碱", "可卡因", "安非他命", "甲基苯丙胺", "冰毒", "搖頭丸", "摇头丸", "迷幻藥", "迷幻药", "鴉片", "鸦片", "芬太尼", "氯胺酮", "愷他命", "恺他命", "k他命", "k粉"],
};
const englishTerms: Record<PromptSafetyCategory, readonly string[]> = {
  minors: ["child", "children", "childhood", "childlike", "kid", "kids", "toddler", "toddlers", "baby", "babies", "infant", "infants", "minor", "minors", "underage", "teen", "teens", "teenager", "teenagers", "adolescent", "adolescents", "preteen", "schoolgirl", "schoolboy", "loli", "lolita", "shota"],
  drugs: ["drug", "drugs", "narcotic", "narcotics", "cocaine", "heroin", "cannabis", "marijuana", "meth", "methamphetamine", "fentanyl", "ketamine", "opium", "mdma", "lsd"],
};
// Word boundaries are Unicode-aware: e.g. "heroine" and "minority" stay valid.
// Optional separators catch "c h i l d", "c.o.c.a.i.n.e", and mixed variants.
const separators = "[\\p{Z}\\p{P}\\p{S}\\s]*";
const englishPatterns = Object.fromEntries(Object.entries(englishTerms).map(([category, words]) => [
  category,
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(word => [...word].join(separators)).join("|")})(?![\\p{L}\\p{N}])`, "iu"),
])) as Record<PromptSafetyCategory, RegExp>;

export function checkPromptSafety(...values: unknown[]): PromptSafetyResult {
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    const normalized = value.normalize("NFKC").replace(invisible, "").toLowerCase();
    const compact = normalized.replace(/[\p{Z}\p{P}\p{S}\s]/gu, "");
    for (const category of ["minors", "drugs"] as const) {
      const age = category === "minors" && (
        /(?<!\d)(?:[0-9]|1[0-7])(?:歲|岁|歳)/u.test(compact)
        || /(?<![零〇一二兩两三四五六七八九十百千])(?:[一二兩两三四五六七八九]|十[一二三四五六七]?)(?:歲|岁|歳)/u.test(compact)
        || /(?:18|十八)(?:歲|岁|歳)(?:以下|未滿|未满)/u.test(compact)
        || /(?<!\d)(?:[0-9]|1[0-7])[\s-]*(?:years?[\s-]*old|yo\b|y\/o\b)/iu.test(normalized)
        || /\b(?:aged?\s*[:=-]?\s*(?:[0-9]|1[0-7])(?!\d)|under[\s-]*18|under[\s-]*eighteen)\b/iu.test(normalized)
      );
      if (age || chineseTerms[category].some(term => compact.includes(term)) || englishPatterns[category].test(normalized)) {
        return { allowed: false, category, code: "prompt_blocked", message: PROMPT_BLOCKED_MESSAGE };
      }
    }
  }
  return { allowed: true };
}

export class PromptSafetyError extends Error {
  readonly status = 400;
  readonly type = "content_policy_error";
  readonly code = "prompt_blocked";
  constructor() { super(PROMPT_BLOCKED_MESSAGE); this.name = "PromptSafetyError"; }
}

export function assertPromptSafety(...values: unknown[]): void {
  if (!checkPromptSafety(...values).allowed) throw new PromptSafetyError();
}
