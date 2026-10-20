import type { BusinessKind } from "@/components/business/types";

export type BusinessStudioTab = "create" | "key" | "history" | "assets" | "usage" | "models";
export interface BusinessStudioLocation { kind: BusinessKind; modelId: string; tab: BusinessStudioTab }

/** Navigation is presentation only; the business APIs still authorize every request. */
export function parseBusinessStudioLocation(params: { get(name: string): string | null }): BusinessStudioLocation {
  const rawKind = params.get("kind");
  const rawTab = params.get("tab");
  const rawModel = params.get("model") ?? "";
  return {
    kind: rawKind === "video" || rawKind === "text" ? rawKind : "image",
    tab: rawTab === "key" || rawTab === "history" || rawTab === "assets" || rawTab === "usage" || rawTab === "models" ? rawTab : "create",
    modelId: /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(rawModel) && !/^(?:sk|csk)-/i.test(rawModel) ? rawModel : "",
  };
}

export function businessStudioHref(location: BusinessStudioLocation): string {
  const safe = parseBusinessStudioLocation(new URLSearchParams({ kind: location.kind, tab: location.tab, model: location.modelId }));
  const query = new URLSearchParams({ kind: safe.kind });
  if (safe.modelId) query.set("model", safe.modelId);
  if (safe.tab !== "create") query.set("tab", safe.tab);
  return `/business?${query.toString()}`;
}
