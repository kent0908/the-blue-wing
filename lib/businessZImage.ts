/** SIRAYA Z-Image. Spicy model IDs require the customer's exact model grant.
 * https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-image/z-image/
 */
const models = {
  "z-image-spicy": {
    label: "Z-Image Spicy",
    maxDimension: 1536,
    defaultWidth: 1024,
    defaultHeight: 1536,
    providerPromptExtendDefault: true,
    promptExtendSurcharged: true,
  },
  "z-image-spicy-pro": {
    label: "Z-Image Spicy Pro",
    maxDimension: 2560,
    defaultWidth: 1024,
    defaultHeight: 1024,
    providerPromptExtendDefault: false,
    promptExtendSurcharged: false,
  },
} as const;

const MIN_DIMENSION = 256;
const MAX_SEED = 2147483647;
const SETTINGS = new Set(["model", "prompt", "size", "width", "height", "n", "seed", "prompt_extend"]);

type ZImageSpicyId = keyof typeof models;

function isZImageSpicyId(id: unknown): id is ZImageSpicyId {
  return typeof id === "string" && Object.hasOwn(models, id);
}

export function getBusinessZImageCapability(id: unknown) {
  if (!isZImageSpicyId(id)) return undefined;
  const capability = models[id];
  const defaultSize = `${capability.defaultWidth}x${capability.defaultHeight}`;
  const common = ["1024x1024", "1024x1536", "1536x1024"];
  const larger = capability.maxDimension === 2560 ? ["2048x2048", "2048x1152", "1152x2048", "2560x2560"] : [];
  return {
    id,
    ...capability,
    defaultSize,
    minDimension: MIN_DIMENSION,
    maxSeed: MAX_SEED,
    maxImageCount: 1,
    maxReferenceImages: 0,
    sizes: [...new Set([defaultSize, ...common, ...larger])],
  };
}
export type BusinessZImageCapability = NonNullable<ReturnType<typeof getBusinessZImageCapability>>;

function invalid(): never {
  throw new Error("invalid_image_parameters");
}

function isDimension(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= MIN_DIMENSION && value <= max;
}

export function buildBusinessZImagePayload(parameters: Record<string, unknown>, referenceCount: number) {
  if (referenceCount !== 0 || Object.keys(parameters).some(key => !SETTINGS.has(key))) invalid();
  const { model, prompt, size, width, height, n, seed, prompt_extend: promptExtend } = parameters;
  const capability = getBusinessZImageCapability(model);
  if (!capability || typeof prompt !== "string" || !prompt.trim() || prompt.length > 12000) invalid();
  if (n !== undefined && n !== 1) invalid();
  if (seed !== undefined && (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED)) invalid();
  if (promptExtend !== undefined && typeof promptExtend !== "boolean") invalid();

  let outputWidth = width === undefined ? capability.defaultWidth : width;
  let outputHeight = height === undefined ? capability.defaultHeight : height;
  if (size !== undefined) {
    const match = typeof size === "string" && /^(\d{3,4})x(\d{3,4})$/.exec(size);
    if (!match) invalid();
    outputWidth = Number(match[1]);
    outputHeight = Number(match[2]);
  }
  if (!isDimension(outputWidth, capability.maxDimension) || !isDimension(outputHeight, capability.maxDimension)) invalid();

  // SIRAYA defaults to a billable rewrite for the standard model. Send the
  // choice explicitly so a caller must opt in to that extra charge.
  return {
    model: capability.id,
    prompt,
    size: `${outputWidth}x${outputHeight}`,
    prompt_extend: promptExtend ?? false,
    ...(seed === undefined ? {} : { seed }),
  };
}
