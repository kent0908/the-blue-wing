import { sql } from "./db";
import { creditCost } from "./credits";
import { SEEDANCE_DRAFT_MODEL, draftCanFinalize, draftExpiryFromReceipt, extractDraftUpstreamId } from "./seedanceDraftRules";

export interface SeedanceDraftRow {
  id: string; user_id: number; request_id: string; job_id: string | null; charge_id: string | null;
  status: string; upstream_task_id: string | null; prompt: string; seconds: number; aspect_ratio: string;
  generate_audio: boolean; seed: number | null; url: string | null; created_at: string; expires_at: string;
  final_status: string | null; final_request_id: string | null; final_job_id: string | null;
  final_attempt_ids: string[];
  final_charge_id: string | null; final_url: string | null;
  draft_credits?: number | null; draft_credits_spent?: number | null;
}

/** Recover a provider ID already saved by paidCall if the later metadata write failed. Never submits anything. */
export async function recoverDraftLedgerBindings(userId: number) {
  await sql`update seedance_drafts d set job_id=cl.ref,status='processing'
    from credit_ledger cl where d.user_id=${userId} and d.charge_id=cl.id and cl.user_id=d.user_id
      and d.job_id is null and cl.reason='video' and cl.delta<0 and cl.ref not like 'pending:%'
      and cl.ref ~ '^[a-zA-Z0-9_-]{1,2000}$'`;
  await sql`update seedance_drafts d set final_job_id=cl.ref,final_status='processing'
    from credit_ledger cl where d.user_id=${userId} and d.final_charge_id=cl.id and cl.user_id=d.user_id
      and d.final_job_id is null and d.final_status in ('submitting','unknown')
      and cl.reason='video' and cl.delta<0 and cl.ref not like 'pending:%' and cl.ref ~ '^[a-zA-Z0-9_-]{1,2000}$'`;
}

export async function getOwnedDraft(userId: number, jobId: string): Promise<SeedanceDraftRow | null> {
  const { rows } = await sql<SeedanceDraftRow>`select d.*, -cl.delta as draft_credits,
    greatest(0,-cl.delta-coalesce((select sum(r.delta) from credit_ledger r where r.user_id=d.user_id
      and ((r.reason in ('charge_refund','charge_partial_refund') and r.ref=cl.id::text) or (r.reason='video_refund' and r.ref=cl.ref))),0))::int as draft_credits_spent
    from seedance_drafts d left join credit_ledger cl on cl.id=d.charge_id and cl.user_id=d.user_id
    where d.user_id=${userId} and d.job_id=${jobId} limit 1`;
  return rows[0] ?? null;
}

export async function getOwnedDraftForJob(userId: number, jobId: string): Promise<SeedanceDraftRow | null> {
  const { rows } = await sql<SeedanceDraftRow>`select d.*, -cl.delta as draft_credits,
    greatest(0,-cl.delta-coalesce((select sum(r.delta) from credit_ledger r where r.user_id=d.user_id
      and ((r.reason in ('charge_refund','charge_partial_refund') and r.ref=cl.id::text) or (r.reason='video_refund' and r.ref=cl.ref))),0))::int as draft_credits_spent
    from seedance_drafts d left join credit_ledger cl on cl.id=d.charge_id and cl.user_id=d.user_id
    where d.user_id=${userId} and (d.job_id=${jobId} or d.final_job_id=${jobId}) limit 1`;
  return rows[0] ?? null;
}

export async function publicDraft(row: SeedanceDraftRow, quoted?: { draftCredits: number; finalCredits: number }) {
  if (row.draft_credits === undefined && row.charge_id) {
    const { rows: charges } = await sql<{ draft_credits: number; draft_credits_spent: number }>`select -cl.delta as draft_credits,
      greatest(0,-cl.delta-coalesce((select sum(r.delta) from credit_ledger r where r.user_id=cl.user_id
        and ((r.reason in ('charge_refund','charge_partial_refund') and r.ref=cl.id::text) or (r.reason='video_refund' and r.ref=cl.ref))),0))::int as draft_credits_spent
      from credit_ledger cl where cl.user_id=${row.user_id} and cl.id=${row.charge_id} and cl.reason='video' and cl.delta<0 limit 1`;
    if (charges[0]) row = { ...row, ...charges[0] };
  }
  const [draftCredits, finalCredits] = quoted ? [quoted.draftCredits, quoted.finalCredits] : await Promise.all([
    creditCost({ kind: "video", model: SEEDANCE_DRAFT_MODEL, seconds: row.seconds, resolution: "480p" }),
    creditCost({ kind: "video", model: SEEDANCE_DRAFT_MODEL, seconds: row.seconds, resolution: "1080p" }),
  ]);
  const originalDraftCredits = typeof row.draft_credits === "number" ? row.draft_credits : draftCredits;
  return {
    id: row.job_id, requestId: row.request_id, status: row.status, prompt: row.prompt,
    seconds: row.seconds, aspectRatio: row.aspect_ratio, generateAudio: row.generate_audio,
    url: row.url, createdAt: row.created_at, expiresAt: row.expires_at,
    canFinalize: draftCanFinalize(row), hasNativeTask: !!row.upstream_task_id,
    finalStatus: row.final_status, finalId: row.final_job_id, finalUrl: row.final_url,
    draftCredits: originalDraftCredits, draftCreditsSpent: row.draft_credits_spent ?? (row.charge_id ? originalDraftCredits : 0),
    finalCredits, totalCredits: originalDraftCredits + finalCredits,
  };
}

export async function saveDraftReceipt(userId: number, jobId: string, json: Record<string, unknown>, status: string, url: string | null) {
  const row = await getOwnedDraft(userId, jobId);
  if (row) {
    const nativeId = status === "completed" ? extractDraftUpstreamId(json) : null;
    const expires = draftExpiryFromReceipt(json, row.created_at);
    await sql`update seedance_drafts set status=${status}, url=coalesce(${url},url),
      upstream_task_id=coalesce(${nativeId},upstream_task_id), expires_at=least(expires_at,${expires}::timestamptz)
      where user_id=${userId} and job_id=${jobId}`;
  }
  // Native provenance must match the saved source draft before considering a final successful.
  const { rows: finalRows } = await sql<SeedanceDraftRow>`select * from seedance_drafts where user_id=${userId} and final_job_id=${jobId} limit 1`;
  if (finalRows[0]) {
    const vendor = json.vendor_data as Record<string, unknown> | undefined;
    if (status === "completed" && vendor?.draft_task_id !== finalRows[0].upstream_task_id) {
      throw new Error("Final video draft provenance mismatch");
    }
    await sql`update seedance_drafts set final_status=${status}, final_url=coalesce(${url},final_url)
      where user_id=${userId} and final_job_id=${jobId}`;
  }
}
