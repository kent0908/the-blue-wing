import { authLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import { sql, type UserRow } from "@/lib/db";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { token } — mark the email verified and log the user in. */
export async function POST(req: NextRequest) {
  const limited = await authLimit(req); if(limited) return limited;
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: { message: "缺少驗證碼", code: "bad_token" } }, { status: 400 });
    }

    const { rows } = await sql<UserRow>`
      update users set email_verified = true, verify_token = null, verify_expires = null
      where verify_token = ${token} and verify_expires > now() and status = 'active'
      returning *
    `;
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ error: { message: "驗證連結無效、已過期或已使用", code: "bad_token" } }, { status: 400 });
    }

    const { token: sessionToken, maxAge } = await createSession(user.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(maxAge));
    return res;
  } catch (err) {
    console.error("verify error:", err);
    return NextResponse.json({ error: { message: "驗證失敗，請稍後再試", code: "internal_error" } }, { status: 500 });
  }
}

