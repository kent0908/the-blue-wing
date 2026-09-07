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
 *
 * Real bug found 2026-09-07: attaching ANY input_references entry makes
 * SIRAYA classify the whole request as task_type "r2v" — and the 1.0-pro /
 * 1.0-pro-fast / 1.5-pro line rejects that task_type outright ("the
 * specified task_type r2v does not support model seedance-1-0-pro-fast"),
 * verified live. The old blanket "seedance" → 6 rule let a caller attach a
 * reference to these anyway, which SIRAYA would then hard-reject — these
 * three get their own 0 entries (longest-prefix-wins overrides the generic
 * "seedance" rule below) rather than inheriting it.
 */

interface VideoRefRule {
  /** matched against the lowercased model id, longest match wins */
  prefix: string;
  max: number;
}

const RULES: VideoRefRule[] = [
  { prefix: "seedance-2.5", max: 50 },
  { prefix: "seedance-1.0-pro-fast", max: 0 },
  { prefix: "seedance-1.0-pro", max: 0 },
  { prefix: "seedance-1.5-pro", max: 0 },
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

/**
 * Per-model valid resolutions + max duration (seconds) for /videos/generations.
 * The UI used to offer the same fixed {480p,720p,1080p} × up to 30s to every
 * video model regardless of which one was selected, which is exactly why a
 * real user hit "the parameter resolution specified in the request is not
 * valid for model dreamina-seedance-2-0-mini in r2v" — 2.0-mini simply
 * doesn't support 1080p at all, but the UI let it be selected anyway.
 *
 * Every row below is from a real, direct probe against SIRAYA on
 * 2026-09-06 (not vendor docs, which don't cover most of these) — submitted
 * a real 5s (or, to find an exact duration ceiling, slightly longer)
 * generation per {model, resolution} and per {model, duration} combination
 * and recorded which ones SIRAYA actually accepted:
 *   - resolution sets are IDENTICAL between plain generation and r2v
 *     (reference-to-video) for every model that supports r2v at all — r2v
 *     does not further restrict resolution beyond what the base model allows
 *   - "4k" is real and accepted for base Seedance 2.0 specifically (not for
 *     2.0-fast, 2.0-mini, or 2.5) — "2k"/"1440p"/"2160p" were all tried and
 *     rejected everywhere, so there is no distinct "2k" resolution tier on
 *     this API, only 480p/720p/1080p/4k
 *   - 1.0-pro / 1.0-pro-fast: SIRAYA's own error names the exact ceiling
 *     ("duration must be ≤ 12"); 1.5-pro doesn't say a number in its error,
 *     so its 12 here was found by direct probing (12 accepted, 15 rejected)
 *   - 2.0 / 2.0-fast / 2.0-mini: SIRAYA's error for these never states a
 *     number either; 15 was confirmed accepted and 30 rejected, matching
 *     what the product owner already knew about 2.0-mini specifically — not
 *     independently confirmed whether something between 16-29 might also
 *     work, since 15 is the value actually wanted for the product here
 *   - 2.5: only model confirmed to accept the full 30s
 */
interface VideoConstraint {
  /** matched against the lowercased model id, longest prefix wins — same convention as RULES above */
  prefix: string;
  resolutions: string[];
  maxSeconds: number;
}

const VIDEO_CONSTRAINTS: VideoConstraint[] = [
  { prefix: "seedance-1.0-pro-fast", resolutions: ["480p", "720p", "1080p"], maxSeconds: 12 },
  { prefix: "seedance-1.0-pro", resolutions: ["480p", "720p", "1080p"], maxSeconds: 12 },
  { prefix: "seedance-1.5-pro", resolutions: ["480p", "720p", "1080p"], maxSeconds: 12 },
  { prefix: "seedance-2.0-fast", resolutions: ["480p", "720p"], maxSeconds: 15 },
  { prefix: "seedance-2.0-mini", resolutions: ["480p", "720p"], maxSeconds: 15 },
  { prefix: "seedance-2.0", resolutions: ["480p", "720p", "1080p", "4k"], maxSeconds: 15 },
  { prefix: "seedance-2.5", resolutions: ["480p", "720p", "1080p"], maxSeconds: 30 },
];

/** Applied when a video model isn't in the table above (e.g. Veo, Sora, or
 *  anything SIRAYA adds later that hasn't been individually probed) — the
 *  narrowest, most conservative option actually confirmed to work for
 *  something on this API, rather than assuming the wide {…,4k}×30s ceiling. */
const DEFAULT_VIDEO_CONSTRAINT: VideoConstraint = { prefix: "", resolutions: ["480p", "720p", "1080p"], maxSeconds: 12 };

export function videoConstraintFor(modelId: string | null | undefined): VideoConstraint {
  if (!modelId) return DEFAULT_VIDEO_CONSTRAINT;
  const id = modelId.toLowerCase().replace(/^nsfw-/, "");
  let best = DEFAULT_VIDEO_CONSTRAINT;
  let bestLen = -1;
  for (const c of VIDEO_CONSTRAINTS) {
    if (id.includes(c.prefix) && c.prefix.length > bestLen) {
      best = c;
      bestLen = c.prefix.length;
    }
  }
  return best;
}
