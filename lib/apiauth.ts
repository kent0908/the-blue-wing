import { limitRequest } from "./rateLimit";
/** Route-handler guards. Each returns either { user } or { error: NextResponse }. */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "./auth";
import type { UserRow } from "./db";
import { touchActivity } from "./crm";

type Guarded = { user: UserRow } | { error: NextResponse };

function fail(status: number, message: string, code: string) {
  return { error: NextResponse.json({ error: { message, code } }, { status }) };
}

export async function requireUser(req: NextRequest): Promise<Guarded> {
  let user;
  try {
    user = await getSessionUser(req);
  } catch (err) {
    console.error("session lookup failed:", err);
    return fail(503, "會員系統尚未設定完成（資料庫未連接），請稍後再試或聯絡管理員", "db_unavailable");
  }
  if (!user) return fail(401, "請先登入", "unauthorized");
  if (!user.email_verified) return fail(403, "請先完成 email 驗證再使用", "email_unverified");
  try {
    const write = !["GET","HEAD","OPTIONS"].includes(req.method);
    if(!await limitRequest("user:"+user.id+":"+(write?"write":"read"),write?30:240,60)) return fail(429,"操作太頻繁，請稍後再試","rate_limited");
  } catch {return fail(503,"服務暫時無法使用","unavailable");}
  void touchActivity(user.id); // DAU/WAU/MAU source — fire-and-forget, deduped per day
  return { user };
}

export async function requireAdmin(req: NextRequest): Promise<Guarded> {
  const r = await requireUser(req);
  if ("error" in r) return r;
  if (r.user.role !== "admin") return fail(403, "需要管理員權限", "forbidden");
  return r;
}

