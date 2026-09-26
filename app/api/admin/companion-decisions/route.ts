import { decisionConfigured } from "@/lib/companionDecisionProvider";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const rows = await sql`select message_id, character_id, policy_version, status, result, duration_ms, error_code, created_at from companion_decision_evaluations order by created_at desc limit 100`;
    return NextResponse.json({ mode: decisionConfigured() ? "shadow" : "off", evaluations: rows.rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "decision_store_unavailable", message: "評估紀錄暫時無法讀取" } }, { status: 503 });
  }
}
