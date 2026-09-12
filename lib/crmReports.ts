import { sql } from "./db";
import { getSettings, listModelCosts } from "./crm";
import { CREDIT_PACKS } from "./creditPacks";
import { PLANS } from "./plans";
import { listRates } from "./rateCard";
import { reportRange, type CrmRange } from "./crmRange";
import { publicPrice } from "./sirayaPublicPrices";

/**
 * Report queries behind /api/crm/overview and /api/crm/finance. Everything
 * is computed from the ledger, usage_events and user_activity_days — no
 * pre-aggregated tables. Financial dates use Asia/Taipei. Historical activity
 * retains its existing day buckets; missing cost snapshots remain unknown.
 */

export const RANGES = [7, 30, 90, 180, 365] as const;

/** Current catalog face value for a ledger grant row; NOT a payment receipt, from the pack / plan it names in `ref` (e.g. "pack_1000 by:…", "pro by:…"). */
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
  adminCreditsSpent: number;
  customerCreditsSpent: number;
  revenueEstUsd: number;
  revenueCashUsd: number;
  costUsd: number | null;
  listCostUsd: number | null;
  profitUsd: number | null;
}

export interface ModelLine {
  model: string;
  kind: string;
  calls: number;
  units: number;
  unit: string;
  credits: number;
  revenueEstUsd: number;
  listCostUsd: number | null;
  costUsd: number | null;
  profitUsd: number | null;
  marginPct: number | null;
  listPriceUsd: number;
  discountPct: number | null;
  rateCredits: number | null;
}

export async function overview(days: number, selected?: CrmRange) {
  const settings = await getSettings();
  const period = selected ?? reportRange(days);
  const { since, until } = period;
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
    sql<{ date: string; n: number }>`select to_char(date_trunc('day', created_at at time zone 'Asia/Taipei'), 'YYYY-MM-DD') as date, count(*)::int as n from users where created_at >= ${since} and created_at < ${until} group by 1`,
    sql<{ date: string; n: number }>`select to_char(date_trunc('day', created_at at time zone 'Asia/Taipei'), 'YYYY-MM-DD') as date, count(*)::int as n from generations where created_at >= ${since} and created_at < ${until} group by 1`,
    sql<{ date: string; spent: number; admin_spent: number }>`select to_char(date_trunc('day', created_at at time zone 'Asia/Taipei'), 'YYYY-MM-DD') as date, coalesce(-sum(delta), 0)::int as spent, coalesce(-sum(delta) filter (where exists (select 1 from users u where u.id = credit_ledger.user_id and u.role = 'admin')),0)::int as admin_spent from credit_ledger where created_at >= ${since} and created_at < ${until} and delta < 0 and reason not in ('idle_video_free') group by 1`,
    sql<{ date: string; reason: string; ref: string | null }>`select to_char(date_trunc('day', created_at at time zone 'Asia/Taipei'), 'YYYY-MM-DD') as date, reason, ref from credit_ledger where created_at >= ${since} and created_at < ${until} and reason in ('credit_pack','plan_grant') and not exists (select 1 from users u where u.id = credit_ledger.user_id and u.role = 'admin')`,
    sql<{ date: string; list_cost: number; cost: number; known: boolean; credits: number }>`select to_char(date_trunc('day', created_at at time zone 'Asia/Taipei'), 'YYYY-MM-DD') as date, coalesce(sum(list_cost_usd), 0)::float8 as list_cost, coalesce(sum(actual_cost_usd), 0)::float8 as cost, bool_and(cost_known and status = 'charged') as known, coalesce(sum(credits) filter (where status = 'charged'),0)::int as credits from usage_events where created_at >= ${since} and created_at < ${until} group by 1`,
    sql<{ date: string; refunded: number; admin_refunded: number }>`select to_char(date_trunc('day', created_at at time zone 'Asia/Taipei'), 'YYYY-MM-DD') as date, coalesce(sum(delta), 0)::int as refunded, coalesce(sum(delta) filter (where exists (select 1 from users u where u.id = credit_ledger.user_id and u.role = 'admin')),0)::int as admin_refunded from credit_ledger where created_at >= ${since} and created_at < ${until} and reason in ('charge_refund','video_refund','charge_partial_refund') group by 1`,
  ]);
  const activeByDay = await sql<{ date: string; n: number }>`select to_char(day, 'YYYY-MM-DD') as date, count(*)::int as n from user_activity_days where day >= ${period.from}::date and day <= ${period.to}::date group by 1`;

  const map = <T extends { date: string }>(rows: T[]) => new Map(rows.map((r) => [r.date, r]));
  const mNew = map(newUsers.rows), mGen = map(gens.rows), mSpend = map(spends.rows), mUse = map(usage.rows), mAct = map(activeByDay.rows), mRef = map(refunds.rows);
  const cashByDay = new Map<string, number>();
  for (const g of grants.rows) cashByDay.set(g.date, (cashByDay.get(g.date) ?? 0) + grantRevenueUsd(g.reason, g.ref));

  const series: DayPoint[] = period.dates.map((date) => {
    const spent = (mSpend.get(date)?.spent ?? 0) - (mRef.get(date)?.refunded ?? 0);
    const u = mUse.get(date);
    const complete = (spent === 0 && !u) || (!!u?.known && u.credits === spent);
    const cost = u?.cost ?? 0;
    const adminSpent = (mSpend.get(date)?.admin_spent ?? 0)-(mRef.get(date)?.admin_refunded ?? 0);
    const customerSpent = spent-adminSpent;
    const revenueEst = customerSpent * settings.credit_value_usd;
    return {
      date,
      activeUsers: mAct.get(date)?.n ?? 0,
      newUsers: mNew.get(date)?.n ?? 0,
      generations: mGen.get(date)?.n ?? 0,
      creditsSpent: spent,
      adminCreditsSpent: adminSpent,
      customerCreditsSpent: customerSpent,
      revenueEstUsd: r2(revenueEst),
      revenueCashUsd: r2(cashByDay.get(date) ?? 0),
      costUsd: complete ? r4(cost) : null,
      listCostUsd: complete ? r4(u?.list_cost ?? 0) : null,
      profitUsd: complete ? r2(revenueEst - cost) : null,
    };
  });
  const sum = (k: keyof DayPoint) => series.reduce((a, p) => a + (p[k] as number), 0);
  const costComplete = series.every(p => p.costUsd !== null);
  const totals = {
    costComplete,
    creditsSpent: sum("creditsSpent"),
    adminCreditsSpent: sum("adminCreditsSpent"),
    customerCreditsSpent: sum("customerCreditsSpent"),
    revenueEstUsd: r2(sum("revenueEstUsd")),
    revenueCashUsd: r2(sum("revenueCashUsd")),
    costUsd: costComplete ? r4(sum("costUsd")) : null,
    listCostUsd: costComplete ? r4(sum("listCostUsd")) : null,
    profitUsd: costComplete ? r2(sum("revenueEstUsd") - sum("costUsd")) : null,
    marginPct: costComplete && sum("revenueEstUsd") > 0 ? r2(((sum("revenueEstUsd") - sum("costUsd")) / sum("revenueEstUsd")) * 100) : null,
    generations: sum("generations"),
    newUsers: sum("newUsers"),
  };
  return { range: period.dates.length, period: {from:period.from,to:period.to,timeZone:"Asia/Taipei"}, settings, users: { ...userTotals.rows[0], ...activity.rows[0] }, totals, series };
}

export async function modelBreakdown(days: number, selected?: CrmRange): Promise<ModelLine[]> {
  const period = selected ?? reportRange(days);
  const { since, until } = period;
  const [settings, costs, rates, rows] = await Promise.all([
    getSettings(),
    listModelCosts(),
    listRates(),
    sql<{ model: string; kind: string; calls: number; units: number; unit: string; credits: number; customer_credits: number; list_cost: number; cost: number; known: boolean }>`
      select model, kind, count(*)::int as calls, coalesce(sum(units), 0)::float8 as units, max(unit) as unit, coalesce(sum(credits) filter (where status = 'charged'), 0)::int as credits, coalesce(sum(credits) filter (where status = 'charged' and not exists (select 1 from users u where u.id=usage_events.user_id and u.role='admin')),0)::int as customer_credits,
        coalesce(sum(list_cost_usd), 0)::float8 as list_cost, coalesce(sum(actual_cost_usd), 0)::float8 as cost, bool_and(cost_known and status = 'charged') as known
      from usage_events where created_at >= ${since} and created_at < ${until} group by model, kind order by credits desc
    `,
  ]);
  const costMap = new Map(costs.map((c) => [c.model_id, c]));
  const rateMap = new Map(rates.map((r) => [r.modelId, r]));
  return rows.rows.map((r) => {
    const revenue = r.customer_credits * settings.credit_value_usd;
    const c = costMap.get(r.model);
    return {
      model: r.model,
      kind: r.kind,
      calls: r.calls,
      units: r4(r.units),
      unit: r.unit,
      credits: r.credits,
      revenueEstUsd: r2(revenue),
      listCostUsd: r.known ? r4(r.list_cost) : null,
      costUsd: r.known ? r4(r.cost) : null,
      profitUsd: r.known ? r2(revenue - r.cost) : null,
      marginPct: r.known && revenue > 0 ? r2(((revenue - r.cost) / revenue) * 100) : null,
      listPriceUsd: publicPrice(r.model)?.price ?? 0,
      discountPct: c?.discount_pct ?? null,
      rateCredits: rateMap.get(r.model)?.credits ?? null,
    };
  });
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
