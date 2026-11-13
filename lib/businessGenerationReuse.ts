import { resolveMentionPrompt, type MentionBindings, type MentionReference } from "./businessMentions";

type Scalar = string | number | boolean;
export interface BusinessGenerationEditor {
  prompt: string;
  mentions: MentionBindings;
}
export interface BusinessGenerationReuseSnapshot {
  version: 1;
  parameters: Record<string, Scalar>;
  references: Pick<MentionReference, "key" | "type">[];
  editor?: BusinessGenerationEditor;
}

const SETTINGS = ["size", "n", "quality", "negative_prompt", "seed", "background", "output_format", "output_compression", "moderation",
  "seconds", "resolution", "aspect_ratio", "generate_audio", "watermark", "prompt_extend", "mode", "max_tokens", "temperature"];
const CREDENTIAL_TEXT = /\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function verifiedEditor(value: unknown, prompt: unknown, references: BusinessGenerationReuseSnapshot["references"], wan3: boolean): BusinessGenerationEditor | undefined {
  if (!record(value) || typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > 12000 ||
    CREDENTIAL_TEXT.test(value.prompt) || !record(value.mentions)) return;
  const editorPrompt = value.prompt.trim();
  const tags = new Set(Array.from(editorPrompt.matchAll(/@([\p{L}\p{N}_-]+)/gu), match => match[1]));
  const keys = new Set(references.map(reference => reference.key));
  const bindings = Object.entries(value.mentions).filter(([tag]) => tags.has(tag));
  if (bindings.length > 50 || bindings.some(([tag, key]) => tag.length > 64 || CREDENTIAL_TEXT.test(tag) ||
    ["__proto__", "constructor", "prototype"].includes(tag) || typeof key !== "string" || !keys.has(key))) return;
  const mentions = Object.fromEntries(bindings) as MentionBindings;
  const resolved = resolveMentionPrompt(editorPrompt, mentions, references.map(reference => ({ ...reference, name: "" })),
    wan3 ? (type, index) => `${type === "video" ? "Video" : "Image"} ${index}` : undefined);
  return resolved === prompt ? { prompt: editorPrompt, mentions } : undefined;
}

/** Call only after the submission and its assets pass the generation adapter's validation. */
export function snapshotBusinessGeneration(parameters: Record<string, unknown>, editor: unknown, wan3: boolean): BusinessGenerationReuseSnapshot {
  const settings: Record<string, Scalar> = {};
  for (const key of SETTINGS) {
    const value = parameters[key];
    if (typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 4000 && !CREDENTIAL_TEXT.test(value)) settings[key] = value;
  }
  const references: BusinessGenerationReuseSnapshot["references"] = [
    ...((parameters.assetIds ?? []) as number[]).map(id => ({ key: `local:${id}`, type: "image" as const })),
    ...((parameters.businessAssetIds ?? []) as string[]).map(id => ({ key: `business:${id}`, type: "image" as const })),
    ...((parameters.businessVideoIds ?? []) as string[]).map(id => ({ key: `business:${id}`, type: "video" as const })),
    ...((parameters.referenceGenerationIds ?? []) as string[]).map(id => ({ key: `generated:${id}`, type: "image" as const })),
    ...((parameters.providerAssets ?? []) as { id: string; type: MentionReference["type"] }[]).map(asset => ({ key: `provider:${asset.id}`, type: asset.type })),
  ];
  if (Array.isArray(parameters.referenceOrder)) {
    const positions = new Map(parameters.referenceOrder.map((key, index) => [key, index]));
    references.sort((a, b) => positions.get(a.key)! - positions.get(b.key)!);
  }
  const verified = verifiedEditor(editor, parameters.prompt, references, wan3);
  return { version: 1, parameters: settings, references, ...(verified && { editor: verified }) };
}
