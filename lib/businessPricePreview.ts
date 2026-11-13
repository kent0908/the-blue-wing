/** A preview needs settings only. Never send the prompt, references or generation key. */
export interface BusinessPriceSettings {
  model: string;
  kind: "image" | "video" | "text";
  seconds?: number;
  resolution?: string;
  aspect?: string;
  size?: string;
  count?: number;
  audio?: boolean;
  videoInput: boolean;
  referenceCount: number;
  rewrite: boolean;
}

export type BusinessPriceUnit = "second" | "image" | "request" | "input" | "output" | "imageInput" | "imageOutput" | "reasoning" | "cache";
interface PriceLine { unit: BusinessPriceUnit; price: string; scale: number }
export interface PriceRule {
  conditions: unknown[];
  lines: PriceLine[];
  complete: boolean;
}
export interface BusinessPricePreview {
  currency: "USD";
  total?: { low: string; high: string; basis: "seconds" | "images" | "videoTokens" | "request" };
  rates: { unit: BusinessPriceUnit; low: string; high: string }[];
  reason?: "duration" | "usage" | "settings" | "unavailable";
}

const units: Record<string, BusinessPriceUnit> = {
  video_seconds: "second", image_generation: "image", request_count: "request", requests: "request",
  input_tokens: "input", output_tokens: "output", video_tokens: "output", output_video_tokens: "output",
  input_image_tokens: "imageInput", image_input_tokens: "imageInput", output_image_tokens: "imageOutput", image_output_tokens: "imageOutput",
  reasoning_tokens: "reasoning", cache_read_tokens: "cache", cache_image_tokens: "cache", cache_write_tokens: "cache",
};
const tokenUnit = (unit: BusinessPriceUnit) => !["second", "image", "request"].includes(unit);
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const keyOf = (value: string) => value.trim().toLowerCase().replace(/[ -]+/g, "_");

// Preserve the exact published decimal. Round only the final display estimate.
const PRECISION = BigInt(10_000_000_000);
const decimal = (n: bigint) => (n / PRECISION) + "." + (n % PRECISION).toString().padStart(10, "0");
function toDecimal(value: string) {
  if (!/^\d{1,7}(?:\.\d{1,10})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * PRECISION + BigInt(fraction.padEnd(10, "0"));
}

export function priceRules(value: unknown, source: "public" | "console"): PriceRule[] {
  const model = object(value);
  if (!model) return [];
  const catalogueRules = source === "public" ? model.pricing : model.rules;
  // Console repeats the default rule on the model; rules remain authoritative when present.
  const rawRules = Array.isArray(catalogueRules) && catalogueRules.length ? catalogueRules
    : source === "console" ? [{ conditions: [], sale_prices_by_billing_unit: model.sale_prices_by_billing_unit }] : [];
  return rawRules.flatMap(raw => {
    const rule = object(raw);
    const fields = source === "public" ? rule?.units : rule?.sale_prices_by_billing_unit;
    if (!rule || (source === "public" ? rule.currency : model.currency) !== "USD" || !Array.isArray(rule.conditions) || !Array.isArray(fields)) return [];
    const lines = fields.flatMap((field): PriceLine[] => {
      const row = object(field);
      const meter = object(row?.billing_unit);
      const name = source === "public" ? row?.billingUnit : meter?.code;
      const price = source === "public" ? row?.salePrice : row?.sale_price;
      const scale = Number(source === "public" ? row?.unitScale : row?.unit_scale);
      const unit = typeof name === "string" ? units[keyOf(name)] : undefined;
      if (!unit || typeof price !== "string" || toDecimal(price) === null || !Number.isSafeInteger(scale) || scale < 1 || scale > 1e9) return [];
      return [{ unit, price, scale }];
    });
    return [{ conditions: rule.conditions, lines, complete: lines.length > 0 && fields.length === lines.length }];
  });
}

function imagePixels(value?: string) {
  const match = value?.match(/^(\d{1,4})[x×](\d{1,4})$/i);
  return match ? Number(match[1]) * Number(match[2]) : undefined;
}

function resolutionNumber(value?: string) {
  return value?.toLowerCase() === "4k" ? 2160 : value?.toLowerCase() === "2k" ? 1440
    : /^\d{3,4}p$/i.test(value ?? "") ? Number(value!.slice(0, -1)) : undefined;
}

function condition(value: unknown, settings: BusinessPriceSettings): boolean | undefined {
  const rule = object(value);
  if (!rule || typeof rule.attribute !== "string" || typeof rule.value !== "string") return;
  let actual: boolean | number | undefined;
  switch (keyOf(rule.attribute)) {
    case "video_resolution": actual = resolutionNumber(settings.resolution); break;
    case "image_resolution": actual = imagePixels(settings.size); break;
    case "include_video_url": actual = settings.videoInput; break;
    case "include_output_audio": actual = settings.audio; break;
    case "include_motion_control":
    case "include_voice_control":
      // These controls are not submitted by the business creation form.
      actual = false; break;
  }
  if (typeof actual === "boolean") {
    if (!["true", "false"].includes(rule.value.toLowerCase())) return;
    const equal = actual === (rule.value.toLowerCase() === "true");
    return rule.operator === "eq" ? equal : rule.operator === "neq" ? !equal : undefined;
  }
  if (typeof actual === "number" && /^\d+(?:\.\d+)?$/.test(rule.value)) {
    const expected = Number(rule.value);
    switch (rule.operator) {
      case "eq": return actual === expected;
      case "neq": return actual !== expected;
      case "gt": return actual > expected;
      case "gte": return actual >= expected;
      case "lt": return actual < expected;
      case "lte": return actual <= expected;
    }
  }
}

// BytePlus Seedance 2.5 pixel table and token estimate at 24 fps. The dimensions
// and FPS are an estimation basis, not a guarantee about a returned video.
const seedance25Dimensions: Record<string, Record<string, [number, number]>> = {
  "480p": { "16:9": [854, 480], "4:3": [752, 560], "1:1": [640, 640], "3:4": [560, 752], "9:16": [480, 854], "21:9": [992, 432] },
  "720p": { "16:9": [1280, 720], "4:3": [1112, 834], "1:1": [960, 960], "3:4": [834, 1112], "9:16": [720, 1280], "21:9": [1470, 630] },
  "1080p": { "16:9": [1920, 1080], "4:3": [1664, 1248], "1:1": [1440, 1440], "3:4": [1248, 1664], "9:16": [1080, 1920], "21:9": [2206, 946] },
};

const positiveInt = (n?: number): n is number => Number.isSafeInteger(n) && n! > 0;

function costsForRule(rule: PriceRule, settings: BusinessPriceSettings) {
  if (!rule.complete || settings.rewrite) return;
  const { lines } = rule;
  const line = lines[0];
  const charge = (price: PriceLine, count: number) => toDecimal(price.price)! * BigInt(count) / BigInt(price.scale);
  const cost = (basis: NonNullable<BusinessPricePreview["total"]>["basis"], amount: bigint) => ({ basis, amounts: [amount] });
  if (lines.length === 1 && line.unit === "second" && settings.kind === "video" && positiveInt(settings.seconds) && !settings.videoInput)
    return cost("seconds", charge(line, settings.seconds));
  if (lines.length === 1 && line.unit === "image" && settings.kind === "image" && positiveInt(settings.count) &&
      // Seedream Pro can add reference-image fees outside the displayed base rate.
      !(settings.model.toLowerCase() === "dola-seedream-5.0-pro" && settings.referenceCount > 1))
    return cost("images", charge(line, settings.count));
  if (lines.length === 1 && line.unit === "request") return cost("request", charge(line, 1));

  const table = seedance25Dimensions[settings.resolution?.toLowerCase() ?? ""];
  const fixed = table?.[settings.aspect ?? ""];
  const dimensions = fixed ? [fixed] : table && settings.aspect === "adaptive" ? Object.values(table) : [];
  if (settings.kind === "video" && /^(?:siraya-|nsfw-(?:siraya-)?)seedance-2\.5$/i.test(settings.model) &&
      !settings.videoInput && dimensions.length && positiveInt(settings.seconds)) {
    const outputs = lines.filter(row => row.unit === "output");
    const output = outputs[0];
    if (outputs.length !== 1 || !lines.every(row => row === output || (row.unit === "reasoning" &&
        row.scale === output.scale && toDecimal(row.price) === toDecimal(output.price)))) return;
    const amounts = dimensions.map(([w, h]) => charge(output, Math.ceil(w * h * 24 * settings.seconds! / 1024)));
    return { basis: "videoTokens" as const, amounts };
  }
}

export function estimateBusinessPrice(settings: BusinessPriceSettings, rules: PriceRule[]): BusinessPricePreview {
  const statuses = rules.map(rule => ({ rule, matches: rule.conditions.map(c => condition(c, settings)) }));
  // Unknown predicates (time, tokens, etc.) must not be treated as confirmed matches.
  const possible = statuses.filter(({ matches }) => !matches.includes(false));
  const confirmedConditional = possible.some(({ matches }) => matches.length && matches.every(m => m === true));
  const candidates = possible.filter(({ matches }) => !confirmedConditional || matches.length > 0);
  const ranges = new Map<BusinessPriceUnit, bigint[]>();
  for (const { rule } of candidates) for (const row of rule.lines) {
    const amount = toDecimal(row.price)! * BigInt(tokenUnit(row.unit) ? 1_000_000 : 1) / BigInt(row.scale);
    if (!ranges.has(row.unit)) ranges.set(row.unit, []);
    ranges.get(row.unit)!.push(amount);
  }
  const range = (values: bigint[]) => {
    const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    return { low: decimal(sorted[0]), high: decimal(sorted[sorted.length - 1]) };
  };
  const totals = candidates.map(({ rule }) => costsForRule(rule, settings));
  const first = totals[0];
  const total = first && candidates.some(({ matches }) => matches.every(m => m === true)) &&
    totals.every(cost => cost?.basis === first.basis)
    ? { basis: first.basis, ...range(totals.flatMap(cost => cost!.amounts)) } : undefined;
  const rates = Array.from(ranges, ([unit, prices]) => ({ unit, ...range(prices) }));
  const reason = total ? undefined : rates.length === 0 ? "unavailable"
    : settings.kind === "video" && (!positiveInt(settings.seconds) || settings.videoInput) ? "duration"
    : settings.kind === "video" || settings.rewrite ? "settings" : "usage";
  return { currency: "USD", total, rates, reason };
}
