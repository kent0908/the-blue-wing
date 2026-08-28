import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

/** YYYY-MM-DD for a Date in UTC (matches Postgres date_trunc on a UTC server). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/admin/analytics?days=30
 * Time series for the admin dashboard charts, zero-filled across the range:
 *   signups[]  { date, count }
 *   credits[]  { date, granted, spent }   (spent is a positive magnitude)
 *   plans[]    { code, count }            (every plan code, including 0)
 */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const n = parseInt(new URL(req.url).searchParams.get("days") || "30", 10);
  const days = RANGES.includes(n) ? n : 30;

  const [signupRows, creditRows, planRows] = await Promise.all([
    sql<{ date: string; count: number }>`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, count(*)::int as count
      from users
      where created_at >= date_trunc('day', now()) - make_interval(days => ${days - 1})
      group by 1 order by 1
    `,
    sql<{ date: string; granted: number; spent: number }>`
      select
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
        coalesce(sum(delta) filter (where delta > 0), 0)::int  as granted,
        coalesce(-sum(delta) filter (where delta < 0), 0)::int as spent
      from credit_ledger
      where created_at >= date_trunc('day', now()) - make_interval(days => ${days - 1})
      group by 1 order by 1
    `,
    sql<{ code: string; count: number }>`
      select plan_code as code, count(*)::int as count from users group by 1
    `,
  ]);

  const signupMap = new Map(signupRows.rows.map((x) => [x.date, x.count]));
  const creditMap = new Map(creditRows.rows.map((x) => [x.date, x]));
  const planMap = new Map(planRows.rows.map((x) => [x.code, x.count]));

  const today = new Date();
  const signups: { date: string; count: number }[] = [];
  const credits: { date: string; granted: number; spent: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = ymd(d);
    signups.push({ date: key, count: signupMap.get(key) ?? 0 });
    const c = creditMap.get(key);
    credits.push({ date: key, granted: c?.granted ?? 0, spent: c?.spent ?? 0 });
  }

  const plans = PLANS.map((p) => ({ code: p.code, name: p.name, count: planMap.get(p.code) ?? 0 }));

  return NextResponse.json({ range: days, signups, credits, plans });
}
