import { randomInt } from "node:crypto";
import { sql } from "./db";

/**
 * Public user id: two uppercase letters + eight digits (e.g. "KX40318275").
 * Shown in the account page, the CRM and audit logs so support can talk
 * about a user without exposing the numeric primary key or the email.
 * Assigned at registration (app/api/auth/register) and backfilled once by
 * scripts/backfill-uids.mjs; `ensureUid` covers any row that slipped past.
 */
export const UID_RE = /^[A-Z]{2}\d{8}$/;

export function generateUid(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I / O — they read like 1 / 0 over the phone
  const a = letters[randomInt(letters.length)];
  const b = letters[randomInt(letters.length)];
  const digits = String(randomInt(0, 100_000_000)).padStart(8, "0");
  return `${a}${b}${digits}`;
}

/** Returns the user's uid, assigning one if the row has none yet (retries on the unlikely collision). */
export async function ensureUid(userId: number): Promise<string> {
  const { rows } = await sql<{ uid: string | null }>`select uid from users where id = ${userId}`;
  if (rows[0]?.uid) return rows[0].uid;
  for (let attempt = 0; attempt < 5; attempt++) {
    const uid = generateUid();
    try {
      const r = await sql<{ uid: string }>`update users set uid = ${uid} where id = ${userId} and uid is null returning uid`;
      if (r.rows[0]) return r.rows[0].uid;
      const again = await sql<{ uid: string | null }>`select uid from users where id = ${userId}`;
      if (again.rows[0]?.uid) return again.rows[0].uid;
    } catch {
      // unique violation — try another
    }
  }
  throw new Error("無法產生使用者編號");
}
