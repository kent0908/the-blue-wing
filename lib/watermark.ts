/** Visible-watermark controls supported by the SIRAYA routes we use.
 * Do not send this provider-specific parameter to GPT Image, Gemini, Veo,
 * Sora or unknown families. This does not disable invisible provenance marks.
 */
function familyId(modelId: string | null | undefined): string {
  return (modelId ?? "").trim().replace(/^(?:(?:NSFW|SIRAYA|ByteDance|Dola)-)+/i, "").toLowerCase();
}

export function supportsImageWatermark(modelId: string | null | undefined): boolean {
  return /^seedream(?:-|$)/.test(familyId(modelId));
}

export function supportsVideoWatermark(modelId: string | null | undefined): boolean {
  return /^seedance(?:-|$)/.test(familyId(modelId));
}

/** Generations use a top-level field, while edits/videos use extra_body. */
export function applyWatermarkDefaults<T extends { model: string; watermark?: boolean; extra_body?: Record<string, unknown> }>(
  body: T,
  kind: "image" | "imageEdit" | "video",
): T {
  const result = { ...body };
  const supported = kind === "video" ? supportsVideoWatermark(body.model) : supportsImageWatermark(body.model);
  const extra = { ...body.extra_body };
  delete extra.watermark;
  delete result.watermark;
  if (supported) {
    if (kind === "image") result.watermark = typeof body.watermark === "boolean" ? body.watermark : false;
    else extra.watermark = typeof body.extra_body?.watermark === "boolean" ? body.extra_body.watermark : false;
  }
  // Avoid an empty provider-specific envelope for providers that reject it.
  if (Object.keys(extra).length) result.extra_body = extra;
  else delete result.extra_body;
  return result;
}
