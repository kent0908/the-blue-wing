/**
 * Models the pickers flag with a "NEW" tag — the studio model menu, the
 * sidebar flyout and the canvas model select all read this one list so the
 * tag appears (and later disappears) everywhere at once. Matched on the
 * canonical id so the NSFW-/SIRAYA- twins of a model are tagged too.
 */
const NEW_MODEL_PATTERNS: RegExp[] = [
  /(?:^|-)gpt-image-2\.5-sunburst$/i,
  /(?:^|-)seedance-2\.5$/i,
];

export function isNewModel(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
  return NEW_MODEL_PATTERNS.some((re) => re.test(modelId));
}
