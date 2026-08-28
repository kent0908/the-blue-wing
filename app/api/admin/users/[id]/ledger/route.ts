import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { recentLedger } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/users/:id/ledger — recent credit_ledger rows for one user. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const { id } = await ctx.params;
  const userId = parseInt(id, 10);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: { message: "使用者 id 不正確", code: "bad_id" } }, { status: 400 });
  }

  const { rows } = await sql<{ ok: boolean }>`select true as ok from users where id = ${userId} limit 1`;
  if (!rows[0]) {
    return NextResponse.json({ error: { message: "找不到這個使用者", code: "not_found" } }, { status: 404 });
  }

  const ledger = await recentLedger(userId, 100);
  return NextResponse.json({ ledger });
}
