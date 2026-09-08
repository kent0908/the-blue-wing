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

export type VideoResolution = "480p" | "720p" | "1080p" | "4k";

/** Output capabilities checked 2026-09-08. Router/NSFW aliases share the
 * underlying model's limits; unknown models must be reviewed before use.
 * https://docs.byteplus.com/en/docs/Byteplus_LAS/video_gen_enhanced
 * https://docs.byteplus.com/docs/ModelArk/1099320
 * https://www.alibabacloud.com/help/en/model-studio/video-generate-edit-model
 * https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate
 */
export function videoResolutionsForModel(modelId: string | null | undefined): readonly VideoResolution[] {
  const id = (modelId ?? "").toLowerCase().replace(/seedance-(\d)-(\d)/, "seedance-$1.$2");
  if (/seedance-2\.0-(mini|fast)(?:-|$)/.test(id) || /seedance-2\.5(?:-|$)/.test(id)) return ["480p", "720p"];
  if (/seedance-2\.0(?:-\d+)?$/.test(id)) return ["480p", "720p", "1080p", "4k"];
  if (/seedance-1\.(0|5)-pro(?:-fast)?(?:-\d+)?$/.test(id)) return ["480p", "720p", "1080p"];
  if (/happyhorse-1\.0-(t2v|i2v|r2v|video-edit)$/.test(id)) return ["720p", "1080p"];
  if (/happyhorse-1\.1-(t2v|i2v|r2v)$/.test(id)) return ["480p", "720p", "1080p"];
  if (id === "veo-3.1-generate-001") return ["720p", "1080p", "4k"];
  return [];
}

/** Only used when a user changes model or resets settings; never silently
 * downgrade an explicit API request (the server rejects that instead). */
export function normalizeVideoResolution(modelId: string | null | undefined, resolution: string): VideoResolution | "" {
  const choices = videoResolutionsForModel(modelId);
  const normalized = resolution.toLowerCase();
  return choices.find((r) => r === normalized) ?? (choices.includes("720p") ? "720p" : choices[0] ?? "");
}

/** Share the reviewed resolution catalog across API and editors. */
export function videoConstraintFor(modelId: string | null | undefined): { resolutions: string[]; maxSeconds: number } {
  const id = (modelId ?? "").toLowerCase();
  const maxSeconds = /seedance-2\.5/.test(id) ? 30 : /seedance-2\.0/.test(id) ? 15 : 12;
  return { resolutions: [...videoResolutionsForModel(modelId)], maxSeconds };
}
