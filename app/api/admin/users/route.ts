import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** GET /api/admin/users?q=&page= — paginated user list with credit balance. */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const url = new URL(req.url);
  const q = `%${(url.searchParams.get("q") || "").trim().toLowerCase()}%`;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { rows } = await sql<{
    id: number;
    email: string;
    role: string;
    status: string;
    email_verified: boolean;
    plan_code: string;
    plan_renews_at: string | null;
    created_at: string;
    balance: number;
    total: number;
  }>`
    select
      u.id, u.email, u.role, u.status, u.email_verified, u.plan_code, u.plan_renews_at, u.created_at,
      coalesce((select sum(delta) from credit_ledger l where l.user_id = u.id), 0)::int as balance,
      count(*) over()::int as total
    from users u
    where lower(u.email) like ${q}
    order by u.created_at desc
    limit ${PAGE_SIZE} offset ${offset}
  `;

  const total = rows[0]?.total ?? 0;
  return NextResponse.json({
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      email_verified: u.email_verified,
      plan_code: u.plan_code,
      plan_renews_at: u.plan_renews_at,
      created_at: u.created_at,
      balance: u.balance,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
