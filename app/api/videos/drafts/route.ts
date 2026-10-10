import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { publicDraft, recoverDraftLedgerBindings, type SeedanceDraftRow } from "@/lib/seedanceDraft";
import { errorResponse } from "@/lib/errors";
import { getRate, creditCostFromRate } from "@/lib/rateCard";
import { SEEDANCE_DRAFT_MODEL } from "@/lib/seedanceDraftRules";
import { SirayaApiError } from "@/lib/siraya";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) {
    auth.error.headers.set("Cache-Control", "private, no-store");
    return auth.error;
  }
  try {
    await recoverDraftLedgerBindings(auth.user.id);
    const { rows } = await sql<SeedanceDraftRow>`select d.*, -cl.delta as draft_credits,
      greatest(0,-cl.delta-coalesce((select sum(r.delta) from credit_ledger r where r.user_id=d.user_id
        and ((r.reason in ('charge_refund','charge_partial_refund') and r.ref=cl.id::text) or (r.reason='video_refund' and r.ref=cl.ref))),0))::int as draft_credits_spent
      from seedance_drafts d left join credit_ledger cl on cl.id=d.charge_id and cl.user_id=d.user_id
      where d.user_id=${auth.user.id} order by d.created_at desc limit 40`;
    if (!rows.length) return NextResponse.json({ drafts: [] }, { headers: { "Cache-Control": "private, no-store" } });
    // One current rate snapshot for the whole library; avoid 80 duplicate DB lookups.
    const rate = await getRate(SEEDANCE_DRAFT_MODEL);
    if (!rate || rate.modality !== "video") throw new SirayaApiError(400, "此模型尚未設定有效費率或已停用", "invalid_request_error", "draft_rate_unavailable");
    const drafts = await Promise.all(rows.map(row => publicDraft(row, {
      draftCredits: creditCostFromRate({ modality: "video", credits: rate.credits, seconds: row.seconds, resolution: "480p" }),
      finalCredits: creditCostFromRate({ modality: "video", credits: rate.credits, seconds: row.seconds, resolution: "1080p" }),
    })));
    return NextResponse.json({ drafts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    const response = errorResponse(err);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
