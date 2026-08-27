/**
 * Password hashing (scrypt, from node:crypto — no native deps) and opaque
 * DB-backed sessions. A session is a random token stored in `sessions`;
 * the cookie only carries that token, so sessions are revocable server-side.
 */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { sql, type UserRow } from "./db";

export const SESSION_COOKIE = "bw_session";
const SESSION_TTL_DAYS = 30;
const SCRYPT_KEYLEN = 64;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${dk.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const dk = scryptSync(pw, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
  const a = Buffer.from(hashHex, "hex");
  return a.length === dk.length && timingSafeEqual(a, dk);
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(userId: number): Promise<{ token: string; maxAge: number }> {
  const token = newToken();
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const expires = new Date(Date.now() + maxAge * 1000).toISOString();
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, ${expires})`;
  return { token, maxAge };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await sql`delete from sessions where token = ${token}`;
}

/**
 * Resolve the current user from the request's session cookie.
 * Returns null when there is no valid, unexpired session for an active user.
 */
export async function getSessionUser(req: NextRequest): Promise<UserRow | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await sql<UserRow & { expires_at: string }>`
    select u.*, s.expires_at
    from sessions s
    join users u on u.id = s.user_id
    where s.token = ${token}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sql`delete from sessions where token = ${token}`;
    return null;
  }
  if (row.status === "banned") return null;
  return row;
}

/** Emails listed in ADMIN_EMAILS are auto-verified and get the admin role. */
export function isBootstrapAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
