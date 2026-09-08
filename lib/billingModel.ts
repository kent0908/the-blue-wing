/** Provider aliases share the established editable site rate, never vendor USD pricing. */
export function canonicalBillingModel(modelId: string): string {
  const id = modelId.toLowerCase();
  if (/^(?:nsfw-)?(?:dola-|bytedance-)?seedream-5[.-]0-pro(?:-\d{6})?$/.test(id)) {
    return id.startsWith("nsfw-") ? "NSFW-Dola-Seedream-5.0-pro" : "Dola-Seedream-5.0-pro";
  }
  return modelId;
}
