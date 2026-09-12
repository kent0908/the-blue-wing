/**
 * Display only: never use this result as a provider ID or database key.
 *
 * One function, applied everywhere a model name reaches a user, so every
 * surface spells a model the same way:
 *   - router / vendor plumbing prefixes (SIRAYA-, ByteDance-, Dola-) are
 *     dropped — the provider's name never appears in the product;
 *   - the moderation prefix "NSFW-" becomes "N-" (the two differently
 *     moderated twins must stay distinguishable — see lib/modelDisplay.ts —
 *     but the raw tag is not something to print next to a companion);
 *   - the family gets its brand casing (GPT, Gemini, Veo, Seedream, Seedance,
 *     Happyhorse, Wan, DeepSeek, …), everything after it is lowercase, and
 *     id hyphens become spaces — so catalogue names and raw ids read the
 *     same: "gpt-image-2" → "GPT image 2", "veo-3.1-generate-001" →
 *     "Veo 3.1 generate 001", "NSFW-SIRAYA-Dola-Seedream-5.0-pro" →
 *     "N-Seedream 5.0 pro", "Gemini 3 Pro Image" → "Gemini 3 pro image".
 */
const FAMILY_CASE: Record<string, string> = {
  gpt: "GPT",
  gemini: "Gemini",
  veo: "Veo",
  seedream: "Seedream",
  seedance: "Seedance",
  happyhorse: "Happyhorse",
  wan: "Wan",
  deepseek: "DeepSeek",
  sora: "Sora",
  kling: "Kling",
  minimax: "MiniMax",
  flux: "Flux",
  claude: "Claude",
  qwen: "Qwen",
  llama: "Llama",
  mistral: "Mistral",
  imagen: "Imagen",
  hunyuan: "Hunyuan",
  pixverse: "PixVerse",
  hailuo: "Hailuo",
  runway: "Runway",
  luma: "Luma",
  glm: "GLM",
  grok: "Grok",
  kimi: "Kimi",
  seed: "Seed",
};

export function modelLabel(value: string | null | undefined): string {
  const clean = (value ?? "")
    .replace(/siraya[\s._:/-]*/gi, "")
    .replace(/(^|NSFW-)(?:(?:ByteDance|Dola)-)+/gi, "$1")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!clean) return "模型";
  const nsfw = /^NSFW-/i.test(clean);
  const body = clean.replace(/^NSFW-/i, "");
  // family = the leading letters before the first separator / digit
  const m = /^([a-z]+)(.*)$/i.exec(body);
  if (!m) return nsfw ? `N-${body}` : body;
  const family = m[1].toLowerCase();
  // brand words keep their casing anywhere in the name ("uncensored-gpt-5.4" → "Uncensored GPT 5.4"); everything else is lowercase
  const rest = m[2]
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trimEnd()
    .replace(/\b([a-z]+)\b/g, (w) => FAMILY_CASE[w] ?? w);
  const cased = FAMILY_CASE[family] ?? family.charAt(0).toUpperCase() + family.slice(1);
  return `${nsfw ? "N-" : ""}${cased}${rest}`;
}
