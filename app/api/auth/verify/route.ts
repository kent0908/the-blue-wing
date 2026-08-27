import { NextRequest, NextResponse } from "next/server";
import { sql, type UserRow } from "@/lib/db";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { token } — mark the email verified and log the user in. */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: { message: "缺少驗證碼", code: "bad_token" } }, { status: 400 });
    }

    const { rows } = await sql<UserRow>`
      select * from users where verify_token = ${token} limit 1
    `;
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ error: { message: "驗證連結無效或已使用", code: "bad_token" } }, { status: 400 });
    }
    if (user.verify_expires && new Date(user.verify_expires).getTime() < Date.now()) {
      return NextResponse.json({ error: { message: "驗證連結已過期，請重新註冊或請管理員協助", code: "expired" } }, { status: 400 });
    }

    await sql`
      update users set email_verified = true, verify_token = null, verify_expires = null
      where id = ${user.id}
    `;

    const { token: sessionToken, maxAge } = await createSession(user.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(maxAge));
    return res;
  } catch (err) {
    console.error("verify error:", err);
    return NextResponse.json({ error: { message: "驗證失敗，請稍後再試", code: "internal_error" } }, { status: 500 });
  }
}
