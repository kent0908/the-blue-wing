import { sql } from "./db";
import { getRate } from "./rateCard";
import { extractProviderReceipt } from "./providerReceipt";
import { publicPrice } from "./sirayaPublicPrices";

/**
 * Back-office (CRM) data layer — settings, the vendor cost card, per-call
 * usage/cost events, activity days for DAU/WAU/MAU, and the admin audit log.
 * Everything here is server-only and read by the /api/crm/* routes.
 *
 * Money model:
 *   consumption face value = customer credits spent × credit_value_usd (not cash)
 *   grant face value = packs/plans issued; issuance is not proof of payment.
 *   estimated cost = vendor tariff × independently known units × (1 - discount).
 *   provider_cost_usd is a separate reported figure, never discounted again.
 * Costs are snapshotted per event at charge time, so editing the cost card
 * later changes future events only — historical reports stay what they were.
 */

/* ---- settings ---------------------------------------------------------- */

export interface CrmSettings {
  /** what one credit is worth to us in USD when spent (default: the 1¢ list value of the smallest pack) */
  credit_value_usd: number;
  /** discount applied to every model without its own discount_pct */
  default_discount_pct: number;
  /** display currency conversion for the dashboard (USD → TWD), purely cosmetic */
  usd_to_twd: number;
}

const DEFAULT_SETTINGS: CrmSettings = { credit_value_usd: 0.01, default_discount_pct: 0, usd_to_twd: 32 };

export async function getSettings(): Promise<CrmSettings> {
  const { rows } = await sql<{ key: string; value: unknown }>`select key, value from crm_settings`;
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in out && typeof r.value === "number" && Number.isFinite(r.value)) (out as Record<string, number>)[r.key] = r.value;
  }
  return out;
}

export async function saveSettings(patch: Partial<CrmSettings>): Promise<CrmSettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    await sql`insert into crm_settings (key, value) values (${key}, ${JSON.stringify(value)}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  }
  return getSettings();
}

/* ---- vendor cost card ---------------------------------------------------- */

export interface ModelCostRow {
  model_id: string;
  list_price_usd: number;
  discount_pct: number | null;
  notes: string;
  updated_at: string;
}

export async function listModelCosts(): Promise<ModelCostRow[]> {
  const { rows } = await sql<ModelCostRow>`select model_id, list_price_usd::float8 as list_price_usd, discount_pct::float8 as discount_pct, notes, updated_at from model_costs order by model_id`;
  return rows;
}

export async function upsertModelCost(modelId: string, patch: { listPriceUsd?: number; discountPct?: number | null; notes?: string }): Promise<void> {
  const current = (await sql<ModelCostRow>`select model_id, list_price_usd::float8 as list_price_usd, discount_pct::float8 as discount_pct, notes, updated_at from model_costs where model_id = ${modelId}`).rows[0];
  const list = patch.listPriceUsd ?? current?.list_price_usd ?? 0;
  const discount = patch.discountPct === undefined ? (current?.discount_pct ?? null) : patch.discountPct;
  const notes = patch.notes ?? current?.notes ?? "";
  await sql`
    insert into model_costs (model_id, list_price_usd, discount_pct, notes) values (${modelId}, ${list}, ${discount}, ${notes})
    on conflict (model_id) do update set list_price_usd = excluded.list_price_usd, discount_pct = excluded.discount_pct, notes = excluded.notes, updated_at = now()
  `;
}

export interface CostQuote {
  units: number;
  unit: "image" | "second" | "ktoken" | "call";
  resolution: string | null;
  listCostUsd: number;
  actualCostUsd: number;
  discountPct: number;
  costKnown: boolean;
  tariffSnapshot?: ReturnType<typeof publicPrice>;
}

/** Quote only independently known vendor units; missing receipts stay unknown. */
export async function quoteCost(model: string, _credits: number, meta: { units?: number; resolution?: string | null } = {}): Promise<CostQuote> {
  const [rate, cost, settings] = await Promise.all([getRate(model), sql<ModelCostRow>`select model_id, list_price_usd::float8 as list_price_usd, discount_pct::float8 as discount_pct, notes, updated_at from model_costs where lower(model_id) = ${model.toLowerCase()}`.then((r) => r.rows[0] ?? null), getSettings()]);
  const unit: CostQuote["unit"] = rate?.modality === "image" ? "image" : rate?.modality === "video" ? "second" : rate?.modality === "text" ? "ktoken" : "call";
  const resolution = meta.resolution ?? null;
  const tariff = publicPrice(model);
  // Credits are a retail policy, not evidence of vendor usage. Unknown costs
  // remain explicitly unknown until a provider usage/cost receipt is available.
  const units = meta.units ?? 0;
  const wanTier = /^wan3\.0-video(?:-prime)?$/i.test(model) ? tariff?.components?.find(c=>c.id===resolution?.toLowerCase()) : undefined;
  const costKnown = !!tariff && (!!wanTier || !tariff.note) && tariff.unit !== "million_output_tokens"
    && meta.units !== undefined && Number.isFinite(units) && units >= 0;
  const discountPct = cost?.discount_pct ?? settings.default_discount_pct;
  const listCostUsd = costKnown ? (wanTier?.price ?? tariff!.price) * units : 0;
  const actualCostUsd = listCostUsd * (1 - Math.min(100, Math.max(0, discountPct)) / 100);
  return { units, unit, resolution, listCostUsd: round6(listCostUsd), actualCostUsd: round6(actualCostUsd), discountPct, costKnown, tariffSnapshot: tariff };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/* ---- usage events -------------------------------------------------------- */

export async function recordUsageEvent(input: { userId: number; chargeId: string | null; kind: string; model: string; credits: number; units?: number; resolution?: string | null; providerResponse?: unknown; quote?: CostQuote | null }): Promise<void> {
  try {
    const q: CostQuote = input.quote === null
      ? { units: input.units ?? 0, unit: "call", resolution: input.resolution ?? null, listCostUsd: 0, actualCostUsd: 0, discountPct: 0, costKnown: false }
      : input.quote ?? await quoteCost(input.model, input.credits, { units: input.units, resolution: input.resolution });
    const receipt = extractProviderReceipt(input.providerResponse);
    const snapshot = { tariff: q.tariffSnapshot ?? null, discountPct: input.quote === null ? null : q.discountPct, version: "2026-09-26", basis: "official_reference" };
    await sql`
      insert into usage_events (user_id, charge_id, kind, model, credits, units, unit, resolution, list_cost_usd, actual_cost_usd, cost_known, pricing_snapshot, provider_cost_usd, provider_usage)
      values (${input.userId}, ${input.chargeId ? Number(input.chargeId) : null}, ${input.kind}, ${input.model}, ${input.credits}, ${q.units}, ${q.unit}, ${q.resolution}, ${q.listCostUsd}, ${q.actualCostUsd}, ${q.costKnown}, ${JSON.stringify(snapshot)}::jsonb, ${receipt?.costUsd ?? null}, ${JSON.stringify(receipt?.usage ?? {})}::jsonb)
    `;
  } catch (err) {
    // reporting must never break a paid call
    console.error("recordUsageEvent failed:", err);
  }
}

export async function markUsageRefunded(chargeId: string): Promise<void> {
  try {
    await sql`update usage_events set status = 'refunded' where charge_id = ${Number(chargeId)}`;
  } catch (err) {
    console.error("markUsageRefunded failed:", err);
  }
}

/* ---- activity ------------------------------------------------------------ */

// Per-instance memo so a chatty client doesn't upsert on every request.
const seenToday = new Map<number, string>();

/** Marks the user active today (idempotent, at most one write per user per day per instance). */
export async function touchActivity(userId: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  if (seenToday.get(userId) === day) return;
  seenToday.set(userId, day);
  try {
    await sql`insert into user_activity_days (user_id, day) values (${userId}, ${day}::date) on conflict do nothing`;
    await sql`update users set last_seen_at = now() where id = ${userId}`;
  } catch (err) {
    seenToday.delete(userId);
    console.error("touchActivity failed:", err);
  }
}

/* ---- audit --------------------------------------------------------------- */

export async function audit(adminId: number, action: string, targetUserId: number | null, detail: Record<string, unknown> = {}, ip?: string | null): Promise<void> {
  try {
    await sql`insert into admin_audit_log (admin_id, action, target_user_id, detail, ip) values (${adminId}, ${action}, ${targetUserId}, ${JSON.stringify(detail)}::jsonb, ${ip ?? null})`;
  } catch (err) {
    console.error("audit failed:", err);
  }
}

/** Update only the owned charge; polling remains idempotent and never reprices history. */
export async function recordProviderReceipt(userId: number, chargeId: string, value: unknown): Promise<void> {
  const receipt = extractProviderReceipt(value);
  if (!receipt) return;
  try {
    await sql`update usage_events set provider_cost_usd = case when provider_cost_source='siraya_console' then provider_cost_usd else coalesce(${receipt.costUsd}, provider_cost_usd) end,
      provider_usage = coalesce(provider_usage, '{}'::jsonb) || ${JSON.stringify(receipt.usage)}::jsonb
      where user_id = ${userId} and charge_id = ${Number(chargeId)}`;
  } catch { console.error("Provider billing receipt could not be recorded"); }
}
