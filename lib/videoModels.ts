/**
 * Per-model cap on how many reference materials (素材) can be attached to a
 * video generation, via SIRAYA's `input_references` field — see lib/siraya.ts.
 *
 * Only the Seedance family is known to support this on SIRAYA. Seedance 2.5's
 * limit (50) is confirmed by BytePlus's own docs:
 *   https://docs.byteplus.com/en/docs/ModelArk/2607688
 * Other Seedance versions aren't individually documented for SIRAYA, so they
 * get a conservative default rather than assuming the same ceiling. Non-
 * Seedance models (veo, sora, …) default to 0 — no picker is shown for them
 * until reference support is confirmed.
 */

interface VideoRefRule {
  /** matched against the lowercased model id, longest match wins */
  prefix: string;
  max: number;
}

const RULES: VideoRefRule[] = [
  { prefix: "seedance-2.5", max: 50 },
  { prefix: "seedance", max: 6 },
];

export function maxRefsForVideoModel(modelId: string | null | undefined): number {
  if (!modelId) return 0;
  const id = modelId.toLowerCase();
  let best = 0;
  let bestLen = -1;
  for (const { prefix, max } of RULES) {
    if (id.includes(prefix) && prefix.length > bestLen) {
      best = max;
      bestLen = prefix.length;
    }
  }
  return best;
}

export function supportsVideoRefs(modelId: string | null | undefined): boolean {
  return maxRefsForVideoModel(modelId) > 0;
}

/**
 * Whether this model accepts an `input_references` entry of type "video"
 * (not just "image") — i.e. reference-to-video (r2v) mode: a short clip
 * guiding the camera move/composition, not just a still. Verified live
 * against SIRAYA on 2026-09-06: SIRAYA-Seedance-2.5 accepted a real
 * `{type:"video", url:<public mp4>}` reference and returned a processing
 * job id (see the one-off test in that day's session) — matches the docs'
 * claim that only Seedance 2.0/2.5 support it, not 1.0-pro/1.5-pro.
 * SIRAYA also validates the reference clip's resolution server-side
 * (rejected a clip under ~480p worth of pixels in that same test) — that
 * isn't re-validated here, the API's own error surfaces to the user as-is.
 */
export function supportsVideoRefInput(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return /seedance-2\.(0|5)(-|$)/.test(id);
}
