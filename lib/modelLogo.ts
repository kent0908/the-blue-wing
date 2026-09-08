/**
 * Per-model brand logo. Real vendor marks, supplied and licensed by the site
 * owner (2026-09-08) — this supersedes lib/modelBadge.ts's coloured-letter
 * placeholders for every family we actually have a file for; the letter badge
 * stays as the fallback for anything not covered here (a model SIRAYA adds
 * later still renders sensibly instead of blank).
 *
 * Matched by family keyword against the model id — same approach as
 * modelBadgeFor, so NSFW-prefixed twins and any future point release resolve
 * to the same logo without needing an exhaustive id table.
 *
 * The source PNGs were normalised before being committed (trimmed, opaque
 * light backgrounds knocked out to alpha, downscaled to 128px): the raw files
 * were a mix of transparent, white-backed and grey-backed, at 178–563px.
 * ModelLogo renders their alpha silhouettes in white on a black chip, keeping
 * the supplied geometry while matching the monochrome interface.
 */
export interface ModelLogo {
  src: string;
  /** for alt text / tooltips */
  label: string;
}

const LOGOS: { test: RegExp; logo: ModelLogo }[] = [
  { test: /seedream|seedance/, logo: { src: "/logos/seed.png", label: "Seed" } },
  { test: /gemini|veo/, logo: { src: "/logos/gemini.png", label: "Gemini" } },
  { test: /gpt/, logo: { src: "/logos/gpt.png", label: "OpenAI" } },
  { test: /happyhorse/, logo: { src: "/logos/happyhorse.png", label: "HappyHorse" } },
  { test: /\bwan\b|^wan|-wan/, logo: { src: "/logos/wan.png", label: "Wan" } },
];

export function modelLogoFor(id: string): ModelLogo | null {
  const stripped = id.toLowerCase().replace(/^nsfw-/, "");
  return LOGOS.find((l) => l.test.test(stripped))?.logo ?? null;
}
