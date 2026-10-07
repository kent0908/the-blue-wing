/** SIRAYA Wan 3.0 wire format. Keep UI/billing resolution lowercase.
 * https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/wan/
 */
export function wanVideoPayload<T extends { model: string }>(body: T): T {
  if (!/^wan3\.0-video(?:-prime)?$/i.test(body.model)) return body;
  const value = body as T & Record<string, unknown>;
  const { extra_body, ...out } = value;
  delete out.negative_prompt;
  const extra = extra_body as { watermark?: boolean } | undefined;
  return {
    ...out,
    model: body.model.toLowerCase(),
    resolution: String(value.resolution ?? "720p").toUpperCase(),
    watermark: typeof value.watermark === "boolean" ? value.watermark : extra?.watermark ?? false,
    generate_audio: value.generate_audio ?? true,
    prompt_extend: value.prompt_extend ?? false,
    ...(Array.isArray(value.input_references) ? {
      input_references: value.input_references.map(({ type, role, url }: {type?: string; role?: string; url: string}) => ({role: role ?? `reference_${type}`, url})),
    } : {}),
  } as T;
}
