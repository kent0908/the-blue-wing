import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/crm/audit?page=1&user=<id> — who did what in the back office, newest first. */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const targetRaw = parseInt(req.nextUrl.searchParams.get("user") || "", 10);
    const target = Number.isInteger(targetRaw) ? targetRaw : null;
    const size = 50;
    const { rows } = await sql<{ id: number; action: string; detail: unknown; ip: string | null; created_at: string; admin_email: string | null; admin_uid: string | null; target_email: string | null; target_uid: string | null; target_id: number | null }>`
      select l.id, l.action, l.detail, l.ip, l.created_at, a.email as admin_email, a.uid as admin_uid, t.email as target_email, t.uid as target_uid, l.target_user_id as target_id
      from admin_audit_log l
      left join users a on a.id = l.admin_id
      left join users t on t.id = l.target_user_id
      where ${target}::bigint is null or l.target_user_id = ${target}
      order by l.created_at desc limit ${size} offset ${(page - 1) * size}
    `;
    return NextResponse.json({ page, entries: rows.map((x) => ({ ...x, id: Number(x.id), target_id: x.target_id === null ? null : Number(x.target_id) })) });
  } catch (err) {
    return errorResponse(err);
  }
}
