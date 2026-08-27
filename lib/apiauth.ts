/** Route-handler guards. Each returns either { user } or { error: NextResponse }. */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "./auth";
import type { UserRow } from "./db";

type Guarded = { user: UserRow } | { error: NextResponse };

function fail(status: number, message: string, code: string) {
  return { error: NextResponse.json({ error: { message, code } }, { status }) };
}

export async function requireUser(req: NextRequest): Promise<Guarded> {
  const user = await getSessionUser(req);
  if (!user) return fail(401, "請先登入", "unauthorized");
  if (!user.email_verified) return fail(403, "請先完成 email 驗證再使用", "email_unverified");
  return { user };
}

export async function requireAdmin(req: NextRequest): Promise<Guarded> {
  const r = await requireUser(req);
  if ("error" in r) return r;
  if (r.user.role !== "admin") return fail(403, "需要管理員權限", "forbidden");
  return r;
}
