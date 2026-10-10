import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { assertModelAccess } from "@/lib/companionGenerationAccess";
import { sql } from "@/lib/db";
import { paidCall, refundCharge } from "@/lib/creditTransactions";
import { creditCost, getBalance } from "@/lib/credits";
import { createVideoFromDraft, SirayaApiError, SirayaConfigError } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { getOwnedDraft, publicDraft, saveDraftReceipt } from "@/lib/seedanceDraft";
import { buildDraftFinalPayload, draftCanFinalize, draftGatewayIdValid, draftRequestIdValid, SEEDANCE_DRAFT_MODEL } from "@/lib/seedanceDraftRules";
import { countInFlightVideoJobs, MAX_CONCURRENT_VIDEO_JOBS } from "@/lib/videoConcurrency";
import { persistGeneratedMedia } from "@/lib/mediaStore";
import { recordGeneration } from "@/lib/generations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (status: number, message: string, code: string) => NextResponse.json({ error: { message, code } }, { status });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;
  try {
    const { id } = await ctx.params;
    if (!draftGatewayIdValid(id)) return fail(400, "無效的草稿編號", "invalid_draft_request");
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "clientRequestId") || !draftRequestIdValid(body.clientRequestId)) {
      return fail(400, "正式成片只接受草稿及唯一提交編號，不能重傳創作參數", "invalid_draft_request");
    }
    assertModelAccess(req, SEEDANCE_DRAFT_MODEL);
    const row = await getOwnedDraft(user.id, id);
    if (!row) return fail(404, "找不到草稿", "draft_not_found");
    if (["submitting", "processing", "completed"].includes(row.final_status ?? "")) {
      return NextResponse.json({ id: row.final_job_id, status: row.final_status, duplicate: true, creditsSpent: 0, draft: await publicDraft(row) });
    }
    if (row.final_status === "failed" && row.final_attempt_ids.some(attempt => attempt.toLowerCase() === body.clientRequestId.toLowerCase())) {
      return NextResponse.json({ id: row.final_job_id, status: "failed", duplicate: true, creditsSpent: 0, draft: await publicDraft(row) });
    }
    if (row.final_status === "unknown") return fail(409, "上次提交結果待確認，為避免重複費用請聯絡客服核對任務", "draft_final_unknown");
    if (new Date(row.expires_at).getTime() <= Date.now()) return fail(410, "草稿的七天生成期限已過，請建立新的草稿", "draft_expired");
    if (!draftCanFinalize(row)) return fail(409, "草稿尚未完成或缺少原始任務識別碼，請重新整理狀態", "draft_not_ready");
    const cost = await creditCost({ kind: "video", model: SEEDANCE_DRAFT_MODEL, seconds: row.seconds, resolution: "1080p" });
    const expected = req.headers.get("x-blue-wing-expected-credits");
    if (expected === null || !/^\d+$/.test(expected) || Number(expected) !== cost) return fail(409, "點數已變更，請重新預覽並確認", "stale_quote");
    const balance = await getBalance(user.id);
    if (balance < cost) return NextResponse.json({ error: { message: "點數不足", code: "insufficient_credits" }, needCredits: true, cost, balance }, { status: 402 });
    if (await countInFlightVideoJobs(user.id) >= MAX_CONCURRENT_VIDEO_JOBS) return fail(429, "同時最多四個影片生成，請等候現有任務完成", "too_many_concurrent");

    // One atomic claim per source draft, regardless of double clicks, tabs or different client request IDs.
    const claim = await sql`update seedance_drafts set final_status='submitting',final_request_id=${body.clientRequestId}::uuid,
      final_attempt_ids=array_append(final_attempt_ids,${body.clientRequestId}::uuid),
      final_job_id=null,final_charge_id=null,final_url=null,final_created_at=now()
      where user_id=${user.id} and job_id=${id} and status='completed' and upstream_task_id is not null
        and expires_at>now() and (final_status is null or final_status='failed')
        and not (${body.clientRequestId}::uuid=any(final_attempt_ids)) returning id`;
    if (!claim.rows.length) {
      const current = await getOwnedDraft(user.id, id);
      return NextResponse.json({ id: current?.final_job_id, status: current?.final_status, duplicate: true, creditsSpent: 0, draft: current ? await publicDraft(current) : null });
    }
    let submission;
    try {
      submission = await paidCall(user.id, cost, "video", SEEDANCE_DRAFT_MODEL, async chargeId => {
        await sql`update seedance_drafts set final_charge_id=${chargeId} where user_id=${user.id} and job_id=${id}`;
        return createVideoFromDraft(buildDraftFinalPayload(row.upstream_task_id!));
      }, { units: row.seconds, resolution: "1080p" });
    } catch (err) {
      // Explicit input/quota rejection is retryable. Network/5xx/malformed outcomes
      // remain blocked for reconciliation: no automatic second paid submission.
      const state = err instanceof SirayaConfigError || (err instanceof SirayaApiError && err.status >= 400 && err.status < 500) ? "failed" : "unknown";
      await sql`update seedance_drafts set final_status=${state} where user_id=${user.id} and job_id=${id}`;
      throw err;
    }
    const { result: json, chargeId } = submission;
    if (!draftGatewayIdValid(json?.id)) {
      await refundCharge(user.id, chargeId);
      await sql`update seedance_drafts set final_status='unknown' where user_id=${user.id} and job_id=${id}`;
      return fail(502, "上游未提供可核對的任務編號，點數已返還；請先核對上游任務", "draft_final_unknown");
    }
    await sql`update seedance_drafts set final_job_id=${json.id},final_status='processing' where user_id=${user.id} and job_id=${id}`;
    let url: string | null = json.output_url ?? json.data?.[0]?.url ?? null;
    if (url) {
      if (json.vendor_data?.draft_task_id !== row.upstream_task_id) {
        await refundCharge(user.id, chargeId);
        await sql`update seedance_drafts set final_status='failed' where user_id=${user.id} and job_id=${id}`;
        return fail(502, "正式影片與草稿來源不符，點數已返還", "draft_final_mismatch");
      }
      url = await persistGeneratedMedia(url, { userId: user.id, kind: "video" });
      await saveDraftReceipt(user.id, json.id, json, "completed", url);
      await recordGeneration(user.id, { kind: "video", model: SEEDANCE_DRAFT_MODEL, prompt: row.prompt, url, ref: json.id });
    }
    return NextResponse.json({ id: json.id, status: url ? "completed" : "processing", url,
      creditsSpent: cost, creditsBalance: await getBalance(user.id), draftId: id });
  } catch (err) { return errorResponse(err); }
}
