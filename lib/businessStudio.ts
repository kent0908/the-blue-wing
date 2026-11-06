import type { BusinessKind } from "@/components/business/types";

export type BusinessStudioTab = "create" | "key" | "history" | "assets" | "usage" | "models" | "workflows";
export interface BusinessStudioLocation { kind: BusinessKind; modelId: string; tab: BusinessStudioTab }

/** Navigation is presentation only; the business APIs still authorize every request. */
export function parseBusinessStudioLocation(params: { get(name: string): string | null }): BusinessStudioLocation {
  const rawKind = params.get("kind");
  const rawTab = params.get("tab");
  const rawModel = params.get("model") ?? "";
  return {
    kind: rawKind === "video" || rawKind === "text" ? rawKind : "image",
    tab: rawTab === "key" || rawTab === "history" || rawTab === "assets" || rawTab === "usage" || rawTab === "models" || rawTab === "workflows" ? rawTab : "create",
    modelId: /^[a-zA-Z0-9._:-]{1,150}$/.test(rawModel) && !/^(?:sk|csk)-/i.test(rawModel) ? rawModel : "",
  };
}

/** An explicit selection must never silently fall back to a different model. */
export function selectBusinessModel<T extends { id: string; modality: BusinessKind; nsfw: boolean; dedicatedVideo?: { capability: string } }>(models: T[], kind: BusinessKind, modelId: string): T | undefined {
  const available = models.filter(model => model.modality === kind);
  if (modelId) return available.find(model => model.id === modelId);
  return available.find(model => !model.nsfw && (!model.dedicatedVideo || model.dedicatedVideo.capability === "text-to-video"))
    ?? available.find(model => !model.nsfw) ?? available[0];
}

export function businessStudioHref(location: BusinessStudioLocation): string {
  const safe = parseBusinessStudioLocation(new URLSearchParams({ kind: location.kind, tab: location.tab, model: location.modelId }));
  const query = new URLSearchParams({ kind: safe.kind });
  if (safe.modelId) query.set("model", safe.modelId);
  if (safe.tab !== "create") query.set("tab", safe.tab);
  return `/business?${query.toString()}`;
}
