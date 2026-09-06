/**
 * Per-model "type" badge for the model picker (Composer.tsx) — a small
 * coloured square with a one/two-letter mark so each row is visually
 * distinguishable at a glance, the way a real logo/thumbnail would be,
 * without needing actual brand assets (which we don't have redistribution
 * rights to bake into the bundle). Classified by family keyword in the model
 * id/name rather than an exhaustive id table, so it degrades gracefully for
 * any model SIRAYA adds later (falls into "?" grey rather than blank).
 */
export interface ModelBadge {
  letter: string;
  bg: string;
  fg: string;
}

const FALLBACK: ModelBadge = { letter: "?", bg: "#242424", fg: "#8a8a8a" };

export function modelBadgeFor(id: string): ModelBadge {
  const stripped = id.toLowerCase().replace(/^nsfw-/, "");
  if (/nano-?banana/.test(stripped)) return { letter: "N", bg: "#3a2f0f", fg: "#f2c94c" };
  if (/gemini|veo/.test(stripped)) return { letter: "G", bg: "#16233d", fg: "#7fb0ff" };
  if (/gpt-image/.test(stripped)) return { letter: "AI", bg: "#262626", fg: "#e8e8e8" };
  if (/seedance/.test(stripped)) return { letter: "S", bg: "#3a1f2e", fg: "#ff8fc0" };
  if (/seedream/.test(stripped)) return { letter: "S", bg: "#241a38", fg: "#c79bff" };
  if (/imagen/.test(stripped)) return { letter: "I", bg: "#16233d", fg: "#7fb0ff" };
  if (/qwen/.test(stripped)) return { letter: "Q", bg: "#1c2f26", fg: "#7fe0ac" };
  if (/kling/.test(stripped)) return { letter: "K", bg: "#2f1c1c", fg: "#ff9b7f" };
  if (/hailuo|minimax/.test(stripped)) return { letter: "M", bg: "#241a38", fg: "#c79bff" };
  if (/luma/.test(stripped)) return { letter: "L", bg: "#1c2f26", fg: "#7fe0ac" };
  if (/happyhorse/.test(stripped)) return { letter: "H", bg: "#3a2410", fg: "#f2a65c" };
  return FALLBACK;
}
