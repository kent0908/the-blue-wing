import { authLimit, limitRequest } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import { sql, toPublicUser, type UserRow } from "@/lib/db";
import { verifyPassword, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = await authLimit(req); if(limited) return limited;
  try {
    const { email, password } = await req.json();
    if (typeof password !== "string" || password.length > 256) {
      return NextResponse.json({ error: { message: "email 或密碼錯誤", code: "bad_credentials" } }, { status: 401 });
    }
    const mail = String(email || "").trim().toLowerCase();

    // Per-account brake on top of the per-IP one: 10 attempts per 15 minutes
    // against one email, so a distributed guess still can't run through a
    // password list. Counted before the lookup so a miss and a wrong
    // password cost the same.
    if (mail && !(await limitRequest("login:" + mail, 10, 900))) {
      return NextResponse.json({ error: { message: "這個帳號嘗試登入次數過多，請 15 分鐘後再試", code: "too_many_attempts" } }, { status: 429, headers: { "Retry-After": "900" } });
    }

    const { rows } = await sql<UserRow>`select * from users where email = ${mail} limit 1`;
    const user = rows[0];

    // same response whether the email exists or the password is wrong
    if (!user || !verifyPassword(String(password || ""), user.password_hash)) {
      return NextResponse.json({ error: { message: "email 或密碼錯誤", code: "bad_credentials" } }, { status: 401 });
    }
    if (user.status === "banned") {
      return NextResponse.json({ error: { message: "此帳號已被停權", code: "banned" } }, { status: 403 });
    }
    if (!user.email_verified) {
      return NextResponse.json(
        { error: { message: "請先完成 email 驗證", code: "email_unverified" } },
        { status: 403 }
      );
    }

    const { token, maxAge } = await createSession(user.id);
    const res = NextResponse.json({ ok: true, user: toPublicUser(user) });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    return res;
  } catch (err) {
    console.error("login error:", err);
    return NextResponse.json({ error: { message: "登入失敗，請稍後再試", code: "internal_error" } }, { status: 500 });
  }
}

