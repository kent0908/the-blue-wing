import type { BusinessModel } from "@/components/business/types";
import type { BusinessWorkflowsCopy } from "@/lib/i18n/businessWorkflows";
import { assertBusinessSeedanceReferences, type BusinessSeedanceMode } from "../businessSeedance";
import { assertBusinessDedicatedVideoReferences, type BusinessDedicatedVideoMode } from "../businessDedicatedVideo";
import type { CanvasGraph, CanvasNode, PortType } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
interface ImageFact { kind: "image"; keys: string[]; originals: number; generated: number }
type Fact = ImageFact | { kind: "text"; text: string } | { kind: "video" };
const INPUTS: Record<string, Record<string, PortType>> = { text: {}, loadImage: {}, director3d: {}, image: { prompt: "text", image: "image" }, video: { prompt: "text", image: "image" } };
const OUTPUTS: Record<string, PortType> = { text: "text", loadImage: "image", director3d: "image", image: "image", video: "video" };

/**
 * Check the ENTIRE selected run before its first paid request. Facts describe
 * this run's future outputs, never stale previews left on a saved graph.
 * This is an early usability guard; the server still authorizes sources and
 * validates exact model contracts before every individual billable request.
 */
export function assertBusinessCanvasPreflight(graph: CanvasGraph, order: string[], models: BusinessModel[], copy: BusinessWorkflowsCopy): void {
  const bad = (message = copy.invalidReference): never => { throw new Error(message); };
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  if (byId.size !== graph.nodes.length || new Set(order).size !== order.length || order.some(id => !byId.has(id))) bad();
  const positions = new Map(order.map((id, index) => [id, index])), facts = new Map<string, Fact>();
  const inputFacts = (node: CanvasNode): Record<string, Fact | undefined> => {
    const inputs: Record<string, Fact | undefined> = {};
    for (const edge of graph.edges.filter(edge => edge.toNode === node.id)) {
      const from = byId.get(edge.fromNode), expected = INPUTS[node.type]?.[edge.toPort];
      if (!from || !expected || edge.fromPort !== "out" || OUTPUTS[from.type] !== expected || inputs[edge.toPort] ||
        !positions.has(from.id) || positions.get(from.id)! >= positions.get(node.id)! || !facts.has(from.id)) throw new Error(copy.invalidReference);
      inputs[edge.toPort] = facts.get(from.id);
    }
    return inputs;
  };
  for (const id of order) {
    const node = byId.get(id)!;
    if (!INPUTS[node.type] || !record(node.data)) bad(copy.unavailableModel);
    const inputs = inputFacts(node);
    if (node.type === "text") { facts.set(id, { kind: "text", text: String(node.data.text ?? "") }); continue; }
    if (node.type === "loadImage") {
      const items = node.data.businessItems;
      if (!Array.isArray(items) || !items.length || items.some(item => !record(item) || typeof item.uploadId !== "string" || !UUID.test(item.uploadId))) bad(copy.originalRequired);
      const keys = (items as { uploadId: string }[]).map(item => `business:${item.uploadId.toLowerCase()}`);
      if (new Set(keys).size !== keys.length) bad();
      facts.set(id, { kind: "image", keys, originals: keys.length, generated: 0 }); continue;
    }
    if (node.type === "director3d") {
      const captured = node.data.capturedImage;
      if (typeof captured !== "string" || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(captured) || captured.length > 2_800_000) bad(copy.missingCapture);
      facts.set(id, { kind: "image", keys: [`capture:${id}`], originals: 1, generated: 0 }); continue;
    }
    const model = models.find(model => model.id === node.data.model && model.modality === node.type);
    if (!model) throw new Error(copy.unavailableModel);
    const prompt = (inputs.prompt?.kind === "text" ? inputs.prompt.text : "") || String(node.data.prompt ?? "");
    if (!prompt.trim()) bad(copy.missingPrompt);
    if (prompt.length > (model.promptMaxChars ?? 12000)) bad(copy.invalidSettings);
    const cjkLimit = model.dedicatedVideo?.cjkPromptMaxChars;
    if (cjkLimit && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prompt) && prompt.length > cjkLimit) bad(copy.invalidSettings);
    const images = inputs.image?.kind === "image" ? inputs.image : undefined, count = images?.keys.length ?? 0;
    if (images && (images.originals > 16 || images.generated > 16 || new Set(images.keys).size !== count)) bad();
    if (count && !model.supportsReferences) bad();
    if (node.type === "image") {
      if (count > (model.maxReferenceImages ?? 0)) bad();
      // The B runner always uses n=1 and only its first completed image.
      facts.set(id, { kind: "image", keys: [`generated:${id}`], originals: 0, generated: 1 }); continue;
    }
    if (node.type !== "video") bad(copy.unavailableModel);
    const requestedSeconds = node.data.seconds;
    // A saved/user-entered duration must match the declared contract. Do not
    // let the runner silently clamp or replace it after the user confirms.
    if (requestedSeconds !== undefined && (typeof requestedSeconds !== "number" || !Number.isSafeInteger(requestedSeconds) ||
      requestedSeconds < (model.minSeconds ?? 2) || requestedSeconds > (model.maxSeconds ?? 15) ||
      model.secondsOptions?.length && !model.secondsOptions.includes(requestedSeconds))) bad(copy.invalidSettings);
    const seconds = requestedSeconds ?? model.defaultSeconds ?? model.secondsOptions?.[0] ?? 5;
    if (!Number.isSafeInteger(seconds) || Number(seconds) < (model.minSeconds ?? 2) || Number(seconds) > (model.maxSeconds ?? 15) ||
      model.secondsOptions?.length && !model.secondsOptions.includes(Number(seconds))) bad(copy.invalidSettings);
    const resolution = model.resolutions?.includes(String(node.data.resolution)) ? String(node.data.resolution) : model.resolutions?.[0];
    if ((model.nativeAudioOnly || node.data.generate_audio === true) && model.nativeAudioResolutions?.length &&
      (!resolution || !model.nativeAudioResolutions.includes(resolution))) bad(copy.invalidSettings);
    const refs = Array.from({ length: count }, () => ({ type: "image" as const }));
    try {
      if (model.seedance) assertBusinessSeedanceReferences(model.seedance, String(node.data.mode || "freestyle") as BusinessSeedanceMode, refs);
      else if (model.dedicatedVideo) assertBusinessDedicatedVideoReferences(model.dedicatedVideo, String(node.data.mode || "freestyle") as BusinessDedicatedVideoMode, refs);
      else if (count) bad();
    } catch { bad(); }
    facts.set(id, { kind: "video" });
  }
}
