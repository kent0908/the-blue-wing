import { videoResolutionsForModel } from "../videoModels";
import { creditsFromRateCard, type RateCardEntry } from "../pricing";
import type { CanvasGraph, CanvasNode } from "./types";

export function canvasNodeCredits(node: CanvasNode, rates: RateCardEntry[]): number | null {
  if (node.type !== "image" && node.type !== "video") return 0;
  if (node.type === "video" && !videoResolutionsForModel(String(node.data.model ?? "")).includes(String(node.data.resolution || "480p") as never)) return null;
  return creditsFromRateCard(rates, String(node.data.model ?? ""), {
    imageCount: 1,
    seconds: Number(node.data.seconds) || 5,
    resolution: String(node.data.resolution || "480p"),
  });
}

export function canvasRunCredits(graph: CanvasGraph, rates: RateCardEntry[], order?: string[]): number | null {
  let total = 0;
  for (const node of graph.nodes) {
    if (order && !order.includes(node.id)) continue;
    const cost = canvasNodeCredits(node, rates);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}
