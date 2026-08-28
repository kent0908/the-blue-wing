import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/stats — headline numbers for the admin overview cards. */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const { rows: u } = await sql<{
    total: number;
    active: number;
    banned: number;
    verified: number;
    paid: number;
    today: number;
    week: number;
  }>`
    select
      count(*)::int                                                          as total,
      count(*) filter (where status = 'active')::int                         as active,
      count(*) filter (where status = 'banned')::int                         as banned,
      count(*) filter (where email_verified)::int                            as verified,
      count(*) filter (where plan_code <> 'free')::int                       as paid,
      count(*) filter (where created_at >= date_trunc('day', now()))::int    as today,
      count(*) filter (where created_at >= now() - interval '7 days')::int   as week
    from users
  `;

  const { rows: c } = await sql<{ granted: number; spent: number; outstanding: number }>`
    select
      coalesce(sum(delta) filter (where delta > 0), 0)::int  as granted,
      coalesce(-sum(delta) filter (where delta < 0), 0)::int as spent,
      coalesce(sum(delta), 0)::int                           as outstanding
    from credit_ledger
  `;

  return NextResponse.json({ users: u[0], credits: c[0] });
}
