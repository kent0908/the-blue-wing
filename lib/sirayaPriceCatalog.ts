import "server-only";
import { fetchConsoleModelPrices } from "./sirayaConsole";
import { priceRules, type PriceRule } from "./businessPricePreview";

const PUBLIC = "https://llm-ext-api.siraya.ai/api/v1/models";
const TTL = 10 * 60 * 1000;
type Catalogue = Map<string, PriceRule[]>;
type Cache = { value?: Catalogue; expires: number; pending?: Promise<Catalogue> };
const publicCache: Cache = { expires: 0 };
const consoleCache: Cache = { expires: 0 };

function cached(cache: Cache, load: () => Promise<Catalogue>) {
  if (cache.value && Date.now() < cache.expires) return Promise.resolve(cache.value);
  cache.pending ??= load().then(value => {
    cache.value = value;
    cache.expires = Date.now() + TTL;
    return value;
  }).finally(() => { cache.pending = undefined; });
  return cache.pending;
}

async function publicModels(): Promise<unknown[]> {
  const signal = AbortSignal.timeout(3500);
  const rows: unknown[] = [];
  for (let page = 1; page <= 20; page++) {
    const response = await fetch(PUBLIC + "?page=" + page + "&pageSize=100", { signal, redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error("price_catalogue_http");
    const { data } = await response.json();
    if (!Array.isArray(data?.items) || data.items.length > 100 || data.page !== page ||
      !Number.isSafeInteger(data.total) || data.total < 0 || (rows.length + data.items.length < data.total && !data.items.length)) throw new Error("price_catalogue_shape");
    rows.push(...data.items);
    if (rows.length >= data.total) return rows;
  }
  throw new Error("price_catalogue_pagination");
}

function toMap(rows: unknown[], source: "public" | "console"): Catalogue {
  const result: Catalogue = new Map();
  const duplicate = new Set<string>();
  for (const raw of rows) {
    const row = raw as { code?: unknown } | null;
    if (typeof row?.code !== "string") continue;
    const key = row.code.toLowerCase();
    if (result.has(key) || duplicate.has(key)) { result.delete(key); duplicate.add(key); continue; }
    const rules = priceRules(raw, source);
    if (rules.some(rule => rule.lines.length)) result.set(key, rules);
  }
  return result;
}

export async function sirayaPriceRules(model: string, source: "public" | "console") {
  const all = source === "public"
    ? await cached(publicCache, async () => toMap(await publicModels(), "public"))
    : await cached(consoleCache, async () => toMap(await fetchConsoleModelPrices(AbortSignal.timeout(3500)), "console"));
  return all.get(model.toLowerCase()) ?? [];
}
