import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql, toPublicUser, type UserRow } from "@/lib/db";
import { addCredits, getBalance } from "@/lib/credits";
import { getPlan } from "@/lib/plans";
import { getCreditPack, CREDIT_PACK_EXPIRY_DAYS } from "@/lib/creditPacks";
import { audit } from "@/lib/crm";
import { newToken } from "@/lib/auth";
import { sendResetEmail, sendVerifyEmail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/:id
 * body: { action, ... }
 *   { action: "grant_credits", amount: number, note?: string }
 *   { action: "set_role",   role: "user" | "admin" }
 *   { action: "set_status", status: "active" | "banned" }
 *   { action: "set_plan",   plan_code: string }   // grants that plan's monthly credits now
 *   { action: "grant_pack", pack_code: string }   // grants a credit pack (lib/creditPacks.ts), 2-year expiry
 *   { action: "send_reset_email" }                 // emails the user a password-reset link (admins never see or set passwords)
 *   { action: "resend_verify" }                    // re-sends the email-verification link
 *   { action: "sign_out_everywhere" }              // revokes every session of the user
 * Every action is written to admin_audit_log (lib/crm.ts).
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
  const ip = req.headers.get("x-forwarded-for");
  let extra: Record<string, unknown> = {};

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
          // Expires at the same moment the next renewal is due — that's what
          // makes "unused monthly credits don't carry over" real rather than
          // a description: once this date passes, getBalance()'s expiry
          // filter just stops counting whatever's left of this grant.
          await addCredits(userId, plan.monthlyCredits, "plan_grant", `${plan.code} by:${admin.email}`, renews);
        }
      }
    } else if (action === "grant_pack") {
      const pack = getCreditPack(String(body.pack_code));
      if (!pack) {
        return NextResponse.json({ error: { message: "找不到這個點數包代碼", code: "bad_pack" } }, { status: 400 });
      }
      const expiresAt = new Date(Date.now() + CREDIT_PACK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await addCredits(userId, pack.credits, "credit_pack", `${pack.code} by:${admin.email}`, expiresAt);
    } else if (action === "send_reset_email") {
      // Same flow the public 忘記密碼 form uses: a one-hour token in the
      // user's row and a link by email. The admin only ever sees whether
      // the mail went out — never the token, never a password.
      if (target.status === "banned") return NextResponse.json({ error: { message: "已停權的帳號無法重設密碼", code: "banned" } }, { status: 400 });
      const token = newToken(24);
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await sql`update users set reset_token = ${token}, reset_expires = ${expires} where id = ${userId}`;
      const url = `${new URL(req.url).origin}/reset-password?token=${token}`;
      let sent = false;
      try { ({ sent } = await sendResetEmail(target.email, url)); } catch (e) { console.error("admin reset mail failed:", e); }
      extra = { sent };
      if (!sent) {
        await audit(admin.id, "user.send_reset_email", userId, { sent: false }, ip);
        return NextResponse.json({ error: { message: "重設連結已建立，但寄信服務尚未設定（RESEND_API_KEY），信件沒有送出", code: "mail_unconfigured" } }, { status: 503 });
      }
    } else if (action === "resend_verify") {
      if (target.email_verified) return NextResponse.json({ error: { message: "這個帳號已經驗證過了", code: "already_verified" } }, { status: 400 });
      const token = newToken(24);
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await sql`update users set verify_token = ${token}, verify_expires = ${expires} where id = ${userId}`;
      const url = `${new URL(req.url).origin}/verify?token=${token}`;
      let sent = false;
      try { ({ sent } = await sendVerifyEmail(target.email, url)); } catch (e) { console.error("admin verify mail failed:", e); }
      extra = { sent };
      if (!sent) {
        await audit(admin.id, "user.resend_verify", userId, { sent: false }, ip);
        return NextResponse.json({ error: { message: "驗證連結已建立，但寄信服務尚未設定（RESEND_API_KEY），信件沒有送出", code: "mail_unconfigured" } }, { status: 503 });
      }
    } else if (action === "sign_out_everywhere") {
      await sql`delete from sessions where user_id = ${userId}`;
    } else {
      return NextResponse.json({ error: { message: "未知的操作", code: "bad_action" } }, { status: 400 });
    }
    await audit(admin.id, `user.${action}`, userId, { ...(body && typeof body === "object" ? Object.fromEntries(Object.entries(body).filter(([k]) => k !== "action")) : {}), ...extra }, ip);

    const { rows: after } = await sql<UserRow>`select * from users where id = ${userId} limit 1`;
    const balance = await getBalance(userId);
    return NextResponse.json({ ok: true, user: { ...toPublicUser(after[0]), balance } });
  } catch (err) {
    console.error("admin patch error:", err);
    return NextResponse.json({ error: { message: "操作失敗", code: "internal_error" } }, { status: 500 });
  }
}
