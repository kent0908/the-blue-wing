import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql, toPublicUser, type UserRow } from "@/lib/db";
import { addCredits, getBalance } from "@/lib/credits";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/:id
 * body: { action, ... }
 *   { action: "grant_credits", amount: number, note?: string }
 *   { action: "set_role",   role: "user" | "admin" }
 *   { action: "set_status", status: "active" | "banned" }
 *   { action: "set_plan",   plan_code: string }   // grants that plan's monthly credits now
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  const admin = r.user;

  const { id } = await ctx.params;
  const userId = parseInt(id, 10);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: { message: "使用者 id 不正確", code: "bad_id" } }, { status: 400 });
  }

  const { rows } = await sql<UserRow>`select * from users where id = ${userId} limit 1`;
  const target = rows[0];
  if (!target) {
    return NextResponse.json({ error: { message: "找不到這個使用者", code: "not_found" } }, { status: 404 });
  }

  const body = await req.json();
  const action = String(body?.action || "");

  try {
    if (action === "grant_credits") {
      const amount = Math.trunc(Number(body.amount));
      if (!Number.isFinite(amount) || amount === 0) {
        return NextResponse.json({ error: { message: "點數金額不正確", code: "bad_amount" } }, { status: 400 });
      }
      await addCredits(userId, amount, "admin_grant", `by:${admin.email}${body.note ? ` ${String(body.note).slice(0, 120)}` : ""}`);
    } else if (action === "set_role") {
      const role = body.role === "admin" ? "admin" : "user";
      if (userId === admin.id && role !== "admin") {
        return NextResponse.json({ error: { message: "不能取消自己的管理員權限", code: "self_lock" } }, { status: 400 });
      }
      await sql`update users set role = ${role} where id = ${userId}`;
    } else if (action === "set_status") {
      const status = body.status === "banned" ? "banned" : "active";
      if (userId === admin.id && status === "banned") {
        return NextResponse.json({ error: { message: "不能停權自己", code: "self_lock" } }, { status: 400 });
      }
      await sql`update users set status = ${status} where id = ${userId}`;
      if (status === "banned") await sql`delete from sessions where user_id = ${userId}`;
    } else if (action === "set_plan") {
      const plan = getPlan(String(body.plan_code));
      if (plan.code === "free") {
        await sql`update users set plan_code = 'free', plan_renews_at = null where id = ${userId}`;
      } else {
        const renews = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await sql`update users set plan_code = ${plan.code}, plan_renews_at = ${renews} where id = ${userId}`;
        if (plan.monthlyCredits > 0) {
          await addCredits(userId, plan.monthlyCredits, "plan_grant", `${plan.code} by:${admin.email}`);
        }
      }
    } else {
      return NextResponse.json({ error: { message: "未知的操作", code: "bad_action" } }, { status: 400 });
    }

    const { rows: after } = await sql<UserRow>`select * from users where id = ${userId} limit 1`;
    const balance = await getBalance(userId);
    return NextResponse.json({ ok: true, user: { ...toPublicUser(after[0]), balance } });
  } catch (err) {
    console.error("admin patch error:", err);
    return NextResponse.json({ error: { message: "操作失敗", code: "internal_error" } }, { status: 500 });
  }
}
