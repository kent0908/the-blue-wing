export interface MentionReference { key: string; name: string; type: "image" | "video" | "audio" }
export type MentionBindings = Record<string, string>;

export function allocateMention(reference: MentionReference, bindings: MentionBindings): string {
  const existing = Object.keys(bindings).find(tag => bindings[tag] === reference.key);
  if (existing) return existing;
  const name = reference.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 40) || "image";
  const base = ["__proto__", "constructor", "prototype"].includes(name) ? `image_${name}` : name;
  let tag = base, index = 2;
  while (Object.hasOwn(bindings, tag) && bindings[tag] !== reference.key) tag = `${base}_${index++}`;
  return tag;
}

/** Keep filenames in the editor; describe the actual ordered references to the model. */
export function resolveMentionPrompt(prompt: string, bindings: MentionBindings, references: MentionReference[]): string {
  const counters = { image: 0, video: 0, audio: 0 };
  const labels = new Map(references.map(reference => [reference.key, `reference ${reference.type} ${++counters[reference.type]}`]));
  return prompt.replace(/@([\p{L}\p{N}_-]+)/gu, (token, tag: string) => {
    const key = Object.hasOwn(bindings, tag) ? bindings[tag] : undefined;
    if (!key) return token;
    const label = labels.get(key);
    if (!label) throw new Error("mention_reference_missing");
    return label;
  });
}
