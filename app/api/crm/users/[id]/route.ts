import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { sql, toPublicUser, type UserRow } from "@/lib/db";
import { getBalance, recentLedger } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/crm/users/:id — one account for the CRM detail page: profile
 * (never the password hash or any token), balance, ledger, usage / cost
 * events, generation stats, activity days and the audit trail that
 * targeted this user. `:id` may be the numeric id or the public uid.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const { id } = await ctx.params;
    const byUid = /^[A-Z]{2}\d{8}$/.test(id.toUpperCase());
    const { rows } = byUid
      ? await sql<UserRow>`select * from users where uid = ${id.toUpperCase()} limit 1`
      : await sql<UserRow>`select * from users where id = ${parseInt(id, 10) || 0} limit 1`;
    const user = rows[0];
    if (!user) return NextResponse.json({ error: { message: "找不到這個使用者", code: "not_found" } }, { status: 404 });
    const uid = Number(user.id);

    const [balance, ledger, usage, gens, activity, auditRows, sessions, characters] = await Promise.all([
      getBalance(uid),
      recentLedger(uid, 100),
      sql<{ id: number; kind: string; model: string; credits: number; units: number; unit: string; resolution: string | null; list_cost_usd: number; actual_cost_usd: number; status: string; cost_known: boolean; created_at: string }>`
        select id, kind, model, credits, units::float8 as units, unit, resolution, list_cost_usd::float8 as list_cost_usd, actual_cost_usd::float8 as actual_cost_usd, status, cost_known, created_at
        from usage_events where user_id = ${uid} order by created_at desc limit 100
      `,
      sql<{ kind: string; n: number; avg_ms: number | null; last: string | null }>`
        select kind, count(*)::int as n, avg(duration_ms)::float8 as avg_ms, max(created_at) as last from generations where user_id = ${uid} group by kind
      `,
      sql<{ days: number; first: string | null; last: string | null }>`
        select count(*)::int as days, min(day) as first, max(day) as last from user_activity_days where user_id = ${uid}
      `,
      sql<{ id: number; action: string; detail: unknown; created_at: string; admin_email: string | null }>`
        select l.id, l.action, l.detail, l.created_at, a.email as admin_email from admin_audit_log l left join users a on a.id = l.admin_id
        where l.target_user_id = ${uid} order by l.created_at desc limit 50
      `,
      sql<{ n: number }>`select count(*)::int as n from sessions where user_id = ${uid} and expires_at > now()`,
      sql<{ n: number }>`select count(*)::int as n from characters where user_id = ${uid}`,
    ]);
    const spend = usage.rows.filter((u) => u.status === "charged");
    return NextResponse.json({
      user: { ...toPublicUser(user), lastSeenAt: user.last_seen_at ?? null },
      balance,
      ledger,
      usage: usage.rows.map((u) => ({ ...u, id: Number(u.id), list_cost_usd: u.cost_known && u.status === "charged" ? u.list_cost_usd : null, actual_cost_usd: u.cost_known && u.status === "charged" ? u.actual_cost_usd : null })),
      usageTotals: {
        calls: spend.length,
        credits: spend.reduce((a, u) => a + u.credits, 0),
        costUsd: usage.rows.every(u=>u.cost_known && u.status === "charged") ? Math.round(spend.reduce((a, u) => a + u.actual_cost_usd, 0) * 10000) / 10000 : null,
      },
      generations: gens.rows,
      activity: activity.rows[0],
      sessions: sessions.rows[0]?.n ?? 0,
      characters: characters.rows[0]?.n ?? 0,
      audit: auditRows.rows.map((x) => ({ ...x, id: Number(x.id) })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
