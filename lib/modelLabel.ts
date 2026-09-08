/** Display only: never use this result as a provider ID or database key. */
export function modelLabel(value: string | null | undefined): string {
  const clean = (value ?? "")
    .replace(/siraya[\s._:/-]*/gi, "")
    .replace(/(^|NSFW-)(?:(?:ByteDance|Dola)-)+/gi, "$1")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ").trim();
  return clean || "模型";
}
