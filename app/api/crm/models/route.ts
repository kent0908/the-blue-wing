import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { modelBreakdown, RANGES } from "@/lib/crmReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/crm/models?days=30 — per-model calls / units / credits / cost / margin. Admin only. */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const n = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
    const days = (RANGES as readonly number[]).includes(n) ? n : 30;
    return NextResponse.json({ range: days, models: await modelBreakdown(days) });
  } catch (err) {
    return errorResponse(err);
  }
}
