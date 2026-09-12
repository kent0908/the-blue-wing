import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { overview, RANGES } from "@/lib/crmReports";

import { reportRange } from "@/lib/crmRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/crm/overview?days=30 — KPIs + daily series (users, activity, credits, revenue, cost, profit). Admin only. */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const n = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
    const days = (RANGES as readonly number[]).includes(n) ? n : 30;
    let period;
    try { period = reportRange(days, req.nextUrl.searchParams.get("from") || undefined, req.nextUrl.searchParams.get("to") || undefined); }
    catch(e) { return NextResponse.json({error:{message:e instanceof Error ? e.message : "日期不正確"}},{status:400}); }
    return NextResponse.json(await overview(days, period));
  } catch (err) {
    return errorResponse(err);
  }
}
