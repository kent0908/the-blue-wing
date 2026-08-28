import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** Whitelisted ORDER BY clauses — the request only picks a key, never raw SQL. */
const SORTS: Record<string, string> = {
  created_desc: "u.created_at desc",
  created_asc: "u.created_at asc",
  balance_desc: "balance desc, u.created_at desc",
  balance_asc: "balance asc, u.created_at desc",
  email_asc: "lower(u.email) asc",
};

const PLAN_CODES = new Set(PLANS.map((p) => p.code));

/**
 * GET /api/admin/users?q=&page=&status=&role=&plan=&sort=
 * Paginated user list with credit balance. status/role/plan filter; sort is one
 * of the SORTS keys (default created_desc).
 */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const status = url.searchParams.get("status");
  const role = url.searchParams.get("role");
  const plan = url.searchParams.get("plan");
  const orderBy = SORTS[url.searchParams.get("sort") || ""] || SORTS.created_desc;

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`lower(u.email) like $${params.length}`);
  }
  if (status === "active" || status === "banned") {
    params.push(status);
    where.push(`u.status = $${params.length}`);
  }
  if (role === "user" || role === "admin") {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (plan && PLAN_CODES.has(plan)) {
    params.push(plan);
    where.push(`u.plan_code = $${params.length}`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  params.push(PAGE_SIZE);
  const limIdx = params.length;
  params.push(offset);
  const offIdx = params.length;

  const text = `
    select
      u.id, u.email, u.role, u.status, u.email_verified, u.plan_code, u.plan_renews_at, u.created_at,
      coalesce((select sum(delta) from credit_ledger l where l.user_id = u.id), 0)::int as balance,
      count(*) over()::int as total
    from users u
    ${whereSql}
    order by ${orderBy}
    limit $${limIdx} offset $${offIdx}
  `;

  const { rows } = await sql.query<{
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
  }>(text, params);

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
