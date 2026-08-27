import { NextRequest, NextResponse } from "next/server";
import { sql, toPublicUser, type UserRow } from "@/lib/db";
import { verifyPassword, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const mail = String(email || "").trim().toLowerCase();

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
