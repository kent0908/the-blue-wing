import { NextRequest, NextResponse } from "next/server";
import { sql, toPublicUser, type UserRow } from "@/lib/db";
import { hashPassword, newToken, isBootstrapAdmin } from "@/lib/auth";
import { sendVerifyEmail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL_MS = 60 * 60 * 1000; // 1h

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const mail = String(email || "").trim().toLowerCase();

    if (!EMAIL_RE.test(mail)) {
      return NextResponse.json({ error: { message: "email 格式不正確", code: "bad_email" } }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: { message: "密碼至少 8 個字元", code: "weak_password" } }, { status: 400 });
    }

    const exists = await sql`select 1 from users where email = ${mail} limit 1`;
    if (exists.rows.length) {
      return NextResponse.json({ error: { message: "這個 email 已經註冊過了", code: "email_taken" } }, { status: 409 });
    }

    const admin = isBootstrapAdmin(mail);
    const token = newToken(24);
    const expires = new Date(Date.now() + VERIFY_TTL_MS).toISOString();

    const { rows } = await sql<UserRow>`
      insert into users (email, password_hash, role, email_verified, verify_token, verify_expires)
      values (
        ${mail},
        ${hashPassword(password)},
        ${admin ? "admin" : "user"},
        ${admin},
        ${admin ? null : token},
        ${admin ? null : expires}
      )
      returning *
    `;
    const user = rows[0];
    // free plan starts at 0 credits — nothing to grant here.

    if (admin) {
      return NextResponse.json({ ok: true, user: toPublicUser(user), needVerify: false });
    }

    const verifyUrl = `${new URL(req.url).origin}/verify?token=${token}`;
    let sent = false;
    try {
      ({ sent } = await sendVerifyEmail(mail, verifyUrl));
    } catch (e) {
      console.error("verify mail failed:", e);
    }

    return NextResponse.json({
      ok: true,
      needVerify: true,
      // only exposed when no mail provider is configured, so you can still test
      devVerifyUrl: sent ? undefined : verifyUrl,
    });
  } catch (err) {
    console.error("register error:", err);
    return NextResponse.json(
      { error: { message: "註冊失敗，請稍後再試", code: "internal_error" } },
      { status: 500 }
    );
  }
}
