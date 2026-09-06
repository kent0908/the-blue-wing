import { authLimit } from "@/lib/rateLimit";
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
  const limited = await authLimit(req); if(limited) return limited;
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
  if (next.length < 8 || next.length > 256) {
    return NextResponse.json({ error: { message: "新密碼至少 8 個字元", code: "weak_password" } }, { status: 400 });
  }

  const { rows } = await sql<UserRow>`
    update users
    set password_hash = ${hashPassword(next)},
        reset_token = null, reset_expires = null, email_verified = true
    where reset_token = ${token} and reset_expires > now() and status = 'active'
    returning *
  `;
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: { message: "重設連結無效、已過期或已使用", code: "bad_token" } }, { status: 400 });
  }
  await sql`delete from sessions where user_id = ${user.id}`;

  const { token: sessionToken, maxAge } = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(maxAge));
  return res;
}

