/** BYOK-only image parameters. C-end retail limits and controls are deliberately separate.
 * SIRAYA: text-to-image/gpt-image, image-to-image/gpt-image, nano-banana and Seedream.
 * BytePlus image-generation-api supplies Seedream's per-version reference counts.
 */
export interface BusinessImageControl {
  key: "quality" | "seed" | "negative_prompt";
  kind: "select" | "number" | "text";
  options?: string[]; min?: number; max?: number;
}
export interface BusinessImageCapability {
  family: "gpt-image" | "gemini" | "seedream";
  sizes: string[];
  maxImageCount: number;
  maxReferenceImages: number;
  controls: BusinessImageControl[];
  qualityOptions: string[];
}
const seedream1k = ["1024x1024", "864x1152", "1152x864", "1312x736", "736x1312", "832x1248", "1248x832", "1568x672"];
const seedream2k = ["2048x2048", "1728x2304", "2304x1728", "2848x1600", "1600x2848", "2496x1664", "1664x2496", "3136x1344"];
const seedream4k = ["4096x4096", "3520x4704", "4704x3520", "5504x3040", "3040x5504", "3328x4992", "4992x3328", "6240x2656"];
function normalized(id: string): string { return id.toLowerCase().replace(/^(?:(?:nsfw|siraya|bytedance|dola)-)+/, ""); }
export function getBusinessImageCapability(id: string): BusinessImageCapability | undefined {
  const model = normalized(id);
  if (/^gpt-image-(?:2|2\.5-(?:flare|sunburst))$/.test(model)) {
    const qualityOptions = ["auto", "low", "medium", "high", ...(/2\.5/.test(model) ? ["xhigh", "max"] : [])];
    return { family: "gpt-image", sizes: ["1024x1024", "1536x1024", "1024x1536", "2048x1152", "1152x2048", "3840x2160", "2160x3840", "auto"], maxImageCount: 10, maxReferenceImages: 16, controls: [{ key: "quality", kind: "select", options: qualityOptions }], qualityOptions };
  }
  if (/^gemini-(?:3-pro-image|3\.1-flash(?:-lite)?-image)$/.test(model)) {
    const lite = /flash-lite/.test(model);
    return { family: "gemini", sizes: lite ? ["1024x1024", "1024x768", "768x1024", "1024x576", "576x1024"] : ["1024x1024", "1536x1024", "1024x1536", "2048x2048", "3840x2160", "2160x3840", "4096x4096", ...(/3\.1-flash-image/.test(model) ? ["512x512"] : [])], maxImageCount: 1, maxReferenceImages: 14, controls: [{ key: "seed", kind: "number", min: 0, max: 2147483647 }], qualityOptions: [] };
  }
  if (/^seedream-(?:4\.(?:0|5)|5\.0-(?:lite|pro))$/.test(model)) {
    const pro = /5\.0-pro/.test(model);
    // Native sequential generation needs a separate output-count adapter.
    // Do not advertise n>1 and silently let the model return one image.
    const sizes = pro ? ["2048x2048", "2560x1440", "1440x2560", "2304x1728", "2K"] : [...(/4\.0/.test(model) ? seedream1k : []), ...seedream2k, ...seedream4k, ...(/4\.0/.test(model) ? ["1K"] : []), "2K", ...(/5\.0-lite/.test(model) ? ["3K"] : []), "4K"];
    return { family: "seedream", sizes, maxImageCount: 1, maxReferenceImages: pro ? 10 : 14, controls: [], qualityOptions: [] };
  }
  return undefined;
}
export function assertBusinessImageParameters(parameters: Record<string, unknown>, referenceCount: number): BusinessImageCapability {
  const caps = getBusinessImageCapability(String(parameters.model));
  const bad = (): never => { throw new Error("invalid_image_parameters"); };
  if (!caps) return bad();
  if (Object.keys(parameters).some(key => !["model", "prompt", "size", "n", "quality", "seed", "assetIds", "businessAssetIds", "background", "output_format", "output_compression", "moderation"].includes(key))) bad();
  if (typeof parameters.prompt !== "string" || !parameters.prompt.trim() || parameters.prompt.length > 12000) bad();
  const n = parameters.n ?? 1;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > caps.maxImageCount || !Number.isSafeInteger(referenceCount) || referenceCount < 0 || referenceCount > caps.maxReferenceImages) bad();
  const size = parameters.size ?? caps.sizes[0];
  if (typeof size !== "string") bad();
  if (caps.family === "gpt-image") {
    if (size !== "auto") {
      const dimensions = /^(\d{2,4})x(\d{2,4})$/.exec(String(size));
      if (!dimensions) bad();
      const w = Number(dimensions![1]), h = Number(dimensions![2]);
      if (w % 16 || h % 16 || w < 16 || h < 16 || w > 3840 || h > 3840 || w * h > 8294400 || w / h < 1 / 3 || w / h > 3) bad();
    }
  } else if (!caps.sizes.includes(String(size))) bad();
  if (parameters.quality !== undefined && !caps.qualityOptions.includes(String(parameters.quality))) bad();
  if (parameters.seed !== undefined && (!caps.controls.some(control => control.key === "seed") || typeof parameters.seed !== "number" || !Number.isSafeInteger(parameters.seed) || parameters.seed < 0 || parameters.seed > 2147483647)) bad();
  for (const key of ["background", "output_format", "output_compression", "moderation"]) if (parameters[key] !== undefined && caps.family !== "gpt-image") bad();
  if (parameters.background !== undefined && !["auto", "opaque", "transparent"].includes(String(parameters.background))) bad();
  if (parameters.output_format !== undefined && !["png", "jpeg"].includes(String(parameters.output_format))) bad();
  if (parameters.background === "transparent" && parameters.output_format === "jpeg") bad();
  if (parameters.output_compression !== undefined && (parameters.output_format !== "jpeg" || typeof parameters.output_compression !== "number" || !Number.isSafeInteger(parameters.output_compression) || parameters.output_compression < 0 || parameters.output_compression > 100)) bad();
  if (parameters.moderation !== undefined && !["auto", "low"].includes(String(parameters.moderation))) bad();
  return caps;
}
