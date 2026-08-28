import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password
 * body: { currentPassword: string, newPassword: string }
 * Verifies the current password, sets the new one, and signs out every other
 * session (the caller's stays valid).
 */
export async function POST(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  const { user } = r;

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "格式錯誤", code: "bad_body" } }, { status: 400 });
  }

  const current = String(body.currentPassword || "");
  const next = String(body.newPassword || "");

  if (!verifyPassword(current, user.password_hash)) {
    return NextResponse.json({ error: { message: "目前密碼不正確", code: "bad_password" } }, { status: 400 });
  }
  if (next.length < 8) {
    return NextResponse.json({ error: { message: "新密碼至少 8 個字元", code: "weak_password" } }, { status: 400 });
  }
  if (verifyPassword(next, user.password_hash)) {
    return NextResponse.json({ error: { message: "新密碼不能和舊密碼相同", code: "same_password" } }, { status: 400 });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  await sql`update users set password_hash = ${hashPassword(next)} where id = ${user.id}`;
  await sql`delete from sessions where user_id = ${user.id} and token <> ${token}`;

  return NextResponse.json({ ok: true });
}
