import { sql } from "./db";
import { getSettings, listModelCosts } from "./crm";
import { CREDIT_PACKS } from "./creditPacks";
import { PLANS } from "./plans";
import { listRates } from "./rateCard";

/**
 * Report queries behind /api/crm/overview and /api/crm/finance. Everything
 * is computed from the ledger, usage_events and user_activity_days — no
 * pre-aggregated tables, so numbers are always exact for the window asked.
 * Days are UTC calendar days (what Postgres date_trunc gives on Vercel).
 */

export const RANGES = [7, 30, 90, 180, 365] as const;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayKeys(days: number): string[] {
  const today = new Date();
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))));
  return out;
}

/** USD received for a ledger grant row, from the pack / plan it names in `ref` (e.g. "pack_1000 by:…", "pro by:…"). */
function grantRevenueUsd(reason: string, ref: string | null): number {
  const code = (ref ?? "").split(/\s+/)[0];
  if (reason === "credit_pack") return CREDIT_PACKS.find((p) => p.code === code)?.priceUSD ?? 0;
  if (reason === "plan_grant") return PLANS.find((p) => p.code === code)?.priceUSD ?? 0;
  return 0;
}

export interface DayPoint {
  date: string;
  activeUsers: number;
  newUsers: number;
  generations: number;
  creditsSpent: number;
  revenueEstUsd: number;
  revenueCashUsd: number;
  costUsd: number;
  listCostUsd: number;
  profitUsd: number;
}

export interface ModelLine {
  model: string;
  kind: string;
  calls: number;
  units: number;
  unit: string;
  credits: number;
  revenueEstUsd: number;
  listCostUsd: number;
  costUsd: number;
  profitUsd: number;
  marginPct: number | null;
  listPriceUsd: number;
  discountPct: number | null;
  rateCredits: number | null;
}

export async function overview(days: number) {
  const settings = await getSettings();
  const since = `${dayKeys(days)[0]}T00:00:00Z`;
  const [userTotals, activity, newUsers, gens, spends, grants, usage, refunds] = await Promise.all([
    sql<{ total: number; verified: number; banned: number; paid: number; today: number; d7: number; d30: number }>`
      select count(*)::int as total,
        count(*) filter (where email_verified)::int as verified,
        count(*) filter (where status = 'banned')::int as banned,
        count(*) filter (where plan_code <> 'free')::int as paid,
        count(*) filter (where created_at >= date_trunc('day', now()))::int as today,
        count(*) filter (where created_at >= now() - interval '7 days')::int as d7,
        count(*) filter (where created_at >= now() - interval '30 days')::int as d30
      from users
    `,
    sql<{ dau: number; wau: number; mau: number }>`
      select
        (select count(distinct user_id) from user_activity_days where day = current_date)::int as dau,
        (select count(distinct user_id) from user_activity_days where day >= current_date - 6)::int as wau,
        (select count(distinct user_id) from user_activity_days where day >= current_date - 29)::int as mau
    `,
    sql<{ date: string; n: number }>`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, count(*)::int as n from users where created_at >= ${since} group by 1`,
    sql<{ date: string; n: number }>`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, count(*)::int as n from generations where created_at >= ${since} group by 1`,
    sql<{ date: string; spent: number }>`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, coalesce(-sum(delta), 0)::int as spent from credit_ledger where created_at >= ${since} and delta < 0 and reason not in ('idle_video_free') group by 1`,
    sql<{ date: string; reason: string; ref: string | null }>`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, reason, ref from credit_ledger where created_at >= ${since} and reason in ('credit_pack','plan_grant')`,
    sql<{ date: string; list_cost: number; cost: number }>`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, coalesce(sum(list_cost_usd), 0)::float8 as list_cost, coalesce(sum(actual_cost_usd), 0)::float8 as cost from usage_events where created_at >= ${since} and status = 'charged' group by 1`,
    sql<{ date: string; refunded: number }>`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, coalesce(sum(delta), 0)::int as refunded from credit_ledger where created_at >= ${since} and reason in ('charge_refund','video_refund','charge_partial_refund') group by 1`,
  ]);
  const activeByDay = await sql<{ date: string; n: number }>`select to_char(day, 'YYYY-MM-DD') as date, count(*)::int as n from user_activity_days where day >= ${dayKeys(days)[0]}::date group by 1`;

  const map = <T extends { date: string }>(rows: T[]) => new Map(rows.map((r) => [r.date, r]));
  const mNew = map(newUsers.rows), mGen = map(gens.rows), mSpend = map(spends.rows), mUse = map(usage.rows), mAct = map(activeByDay.rows), mRef = map(refunds.rows);
  const cashByDay = new Map<string, number>();
  for (const g of grants.rows) cashByDay.set(g.date, (cashByDay.get(g.date) ?? 0) + grantRevenueUsd(g.reason, g.ref));

  const series: DayPoint[] = dayKeys(days).map((date) => {
    const spent = Math.max(0, (mSpend.get(date)?.spent ?? 0) - (mRef.get(date)?.refunded ?? 0));
    const cost = mUse.get(date)?.cost ?? 0;
    const revenueEst = spent * settings.credit_value_usd;
    return {
      date,
      activeUsers: mAct.get(date)?.n ?? 0,
      newUsers: mNew.get(date)?.n ?? 0,
      generations: mGen.get(date)?.n ?? 0,
      creditsSpent: spent,
      revenueEstUsd: r2(revenueEst),
      revenueCashUsd: r2(cashByDay.get(date) ?? 0),
      costUsd: r4(cost),
      listCostUsd: r4(mUse.get(date)?.list_cost ?? 0),
      profitUsd: r2(revenueEst - cost),
    };
  });
  const sum = (k: keyof DayPoint) => series.reduce((a, p) => a + (p[k] as number), 0);
  const totals = {
    creditsSpent: sum("creditsSpent"),
    revenueEstUsd: r2(sum("revenueEstUsd")),
    revenueCashUsd: r2(sum("revenueCashUsd")),
    costUsd: r2(sum("costUsd")),
    listCostUsd: r2(sum("listCostUsd")),
    profitUsd: r2(sum("revenueEstUsd") - sum("costUsd")),
    marginPct: sum("revenueEstUsd") > 0 ? r2(((sum("revenueEstUsd") - sum("costUsd")) / sum("revenueEstUsd")) * 100) : null,
    generations: sum("generations"),
    newUsers: sum("newUsers"),
  };
  return { range: days, settings, users: { ...userTotals.rows[0], ...activity.rows[0] }, totals, series };
}

export async function modelBreakdown(days: number): Promise<ModelLine[]> {
  const since = `${dayKeys(days)[0]}T00:00:00Z`;
  const [settings, costs, rates, rows] = await Promise.all([
    getSettings(),
    listModelCosts(),
    listRates(),
    sql<{ model: string; kind: string; calls: number; units: number; unit: string; credits: number; list_cost: number; cost: number }>`
      select model, kind, count(*)::int as calls, coalesce(sum(units), 0)::float8 as units, max(unit) as unit, coalesce(sum(credits), 0)::int as credits,
        coalesce(sum(list_cost_usd), 0)::float8 as list_cost, coalesce(sum(actual_cost_usd), 0)::float8 as cost
      from usage_events where created_at >= ${since} and status = 'charged' group by model, kind order by credits desc
    `,
  ]);
  const costMap = new Map(costs.map((c) => [c.model_id, c]));
  const rateMap = new Map(rates.map((r) => [r.modelId, r]));
  return rows.rows.map((r) => {
    const revenue = r.credits * settings.credit_value_usd;
    const c = costMap.get(r.model);
    return {
      model: r.model,
      kind: r.kind,
      calls: r.calls,
      units: r4(r.units),
      unit: r.unit,
      credits: r.credits,
      revenueEstUsd: r2(revenue),
      listCostUsd: r4(r.list_cost),
      costUsd: r4(r.cost),
      profitUsd: r2(revenue - r.cost),
      marginPct: revenue > 0 ? r2(((revenue - r.cost) / revenue) * 100) : null,
      listPriceUsd: c?.list_price_usd ?? 0,
      discountPct: c?.discount_pct ?? null,
      rateCredits: rateMap.get(r.model)?.credits ?? null,
    };
  });
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
