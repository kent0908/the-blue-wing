import { NextRequest, NextResponse } from "next/server";
import { sql, type UserRow } from "@/lib/db";
import { hashPassword, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password  { token, newPassword }
 * Consumes a reset token, sets the new password, signs out every existing
 * session for that user, then logs the caller in with a fresh session.
 */
export async function POST(req: NextRequest) {
  let body: { token?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "格式錯誤", code: "bad_body" } }, { status: 400 });
  }

  const token = String(body.token || "");
  const next = String(body.newPassword || "");

  if (!token) {
    return NextResponse.json({ error: { message: "缺少重設碼", code: "bad_token" } }, { status: 400 });
  }
  if (next.length < 8) {
    return NextResponse.json({ error: { message: "新密碼至少 8 個字元", code: "weak_password" } }, { status: 400 });
  }

  const { rows } = await sql<UserRow>`select * from users where reset_token = ${token} limit 1`;
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: { message: "重設連結無效或已使用", code: "bad_token" } }, { status: 400 });
  }
  if (user.reset_expires && new Date(user.reset_expires).getTime() < Date.now()) {
    return NextResponse.json({ error: { message: "重設連結已過期，請重新申請", code: "expired" } }, { status: 400 });
  }

  await sql`
    update users
    set password_hash = ${hashPassword(next)},
        reset_token = null,
        reset_expires = null,
        email_verified = true
    where id = ${user.id}
  `;
  await sql`delete from sessions where user_id = ${user.id}`;

  const { token: sessionToken, maxAge } = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(maxAge));
  return res;
}
