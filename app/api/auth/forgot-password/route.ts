import { NextRequest, NextResponse } from "next/server";
import { sql, type UserRow } from "@/lib/db";
import { newToken } from "@/lib/auth";
import { sendResetEmail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * POST /api/auth/forgot-password  { email }
 * Always responds 200 (never reveals whether the email is registered). When a
 * matching active account exists, stores a reset token and emails the link;
 * with no mail provider configured the link comes back as `devResetUrl`.
 */
export async function POST(req: NextRequest) {
  let email = "";
  try {
    ({ email } = await req.json());
  } catch {
    /* fall through — treated as no match */
  }
  const mail = String(email || "").trim().toLowerCase();

  const generic = { ok: true as const };
  if (!mail) return NextResponse.json(generic);

  const { rows } = await sql<UserRow>`select * from users where email = ${mail} limit 1`;
  const user = rows[0];
  if (!user || user.status === "banned") return NextResponse.json(generic);

  const token = newToken(24);
  const expires = new Date(Date.now() + RESET_TTL_MS).toISOString();
  await sql`update users set reset_token = ${token}, reset_expires = ${expires} where id = ${user.id}`;

  const resetUrl = `${new URL(req.url).origin}/reset-password?token=${token}`;
  let sent = false;
  try {
    ({ sent } = await sendResetEmail(mail, resetUrl));
  } catch (e) {
    console.error("reset mail failed:", e);
  }

  return NextResponse.json(sent ? generic : { ...generic, devResetUrl: resetUrl });
}
