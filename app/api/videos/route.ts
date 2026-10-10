import { resolveGenerationImage } from "@/lib/resolveGenerationImage";
import { normalizeReferenceDataUrl } from "@/lib/referenceImage";
import { resolveProviderAssetReferences } from "@/lib/providerAssets";
import { createGenerationAssetUrls } from "@/lib/generationAssetUrls";
import { buildVideoModePayload, getGenerationModes, type GenerationMode } from "@/lib/generationModes";
import { SirayaApiError } from "@/lib/siraya";
import { assertModelAccess } from "@/lib/companionGenerationAccess";
import { validateGeneration } from "@/lib/generationValidation";
import { paidCall, refundCharge } from "@/lib/creditTransactions";
import { NextRequest, NextResponse } from "next/server";
import { applyWatermarkDefaults } from "@/lib/watermark";
import { createVideo } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, creditCost } from "@/lib/credits";
import { recordGeneration } from "@/lib/generations";
import { maxRefsForVideoModel, supportsVideoRefInput } from "@/lib/videoModels";
import { persistGeneratedMedia } from "@/lib/mediaStore";
import { sql } from "@/lib/db";
import { publicDraft, saveDraftReceipt, type SeedanceDraftRow } from "@/lib/seedanceDraft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Video is the only generation kind that's genuinely async/long-running —
// image and text charge-and-call inside one request/response (see
// lib/creditTransactions.ts's paidCall), so there's nothing to be "in
// flight" there. A charged video row counts as in-flight until either
// history, draft/companion terminal status, or the exact charge refund settles it.
// The frontend already caps concurrent jobs at the same number
// (MAX_CONCURRENT_JOBS in lib/jobsStore.tsx) but that's UI-only and doesn't
// stop a direct API caller from firing far more submissions than that.
// paidCall repeats this guard atomically inside the per-user ledger lock,
// counting provider-pending reservations as well as submitted jobs.
import { countInFlightVideoJobs, MAX_CONCURRENT_VIDEO_JOBS } from "@/lib/videoConcurrency";


/**
 * POST /api/videos
 * Proxies POST https://llm.siraya.ai/v1/videos/generations
 *
 * We always submit with async:true so the request returns immediately with a
 * job id; the client then polls /api/videos/{id}. Long video renders would
 * otherwise blow past serverless request timeouts.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  try {
    const body = await req.json();
    assertModelAccess(req, body?.model);
    validateGeneration(body, "video");
    if (!body?.model || !body?.prompt) {
      return NextResponse.json(
        { error: { message: "`model` and `prompt` are required.", type: "invalid_request_error", code: 400 } },
        { status: 400 }
      );
    }
    if (body.draft === true) {
      const { rows: existing } = await sql<SeedanceDraftRow>`select * from seedance_drafts
        where user_id=${user.id} and request_id=${body.clientRequestId}::uuid limit 1`;
      if (existing[0]) return NextResponse.json({ id: existing[0].job_id, status: existing[0].status, url: existing[0].url,
        duplicate: true, creditsSpent: 0, draft: await publicDraft(existing[0]) });
    }

    // reference materials: can come from the user's own asset library
    // (assetIds — resolved to short-lived signed URLs, since the blob store is
    // private) and/or plain URLs (智慧畫布 node-chaining: a prior node's own
    // generated-image output isn't in the asset library, so it can't go
    // through assetIds — forward it straight through as a reference
    // instead). Both can be present at once — combine them, capped at this
    // model's reference limit. Only Seedance models are known to support
    // this on SIRAYA.
    const { assetIds, imageUrls, videoUrl, providerAssetIds, generationMode, draft, clientRequestId, ...videoBody } = body;
    const allowedModes = getGenerationModes(String(body.model), "video");
    const hasImage = (Array.isArray(assetIds) && assetIds.length) || (Array.isArray(imageUrls) && imageUrls.length);
    const selectedMode = generationMode || (hasImage && maxRefsForVideoModel(String(body.model)) === 0 && allowedModes.some(m=>m.id==="image-to-video" && m.enabled) ? "image-to-video" : allowedModes.find(m=>m.enabled)?.id);
    if(generationMode && !allowedModes.some(m=>m.id===generationMode && m.enabled)) throw new SirayaApiError(400,"此模型尚未開放所選模式");
    const frameMode = selectedMode === "first-last-frame" || selectedMode === "image-to-video";
    if (/^wan3\.0-video/i.test(body.model) && providerAssetIds?.length) throw new SirayaApiError(400,"Wan 請直接選擇素材庫圖片，尚未支援已審核素材識別碼");
    const trusted = Array.isArray(providerAssetIds) && providerAssetIds.length ? await resolveProviderAssetReferences(user.id, providerAssetIds) : [];
    if (trusted.length && (!allowedModes.some(m=>m.id==="subject-reference" && m.enabled) || frameMode)) throw new SirayaApiError(400,"此模式不接受已審核素材，請選擇主體參考。");
    const refCap = maxRefsForVideoModel(String(body.model));
    if (refCap > 0 || frameMode || allowedModes.length) {
      const refs: { type: "image" | "video"; url: string }[] = [];
      if (videoUrl && !supportsVideoRefInput(String(body.model))) throw new SirayaApiError(400,"此模型尚未開放影片參考，請使用圖片參考");
      if (Array.isArray(assetIds) && assetIds.length) {
        if (assetIds.some((id: unknown) => typeof id !== "number" || !Number.isSafeInteger(id) || Number(id) < 1)) throw new SirayaApiError(400,"參考素材格式不正確");
        const cap = frameMode ? (selectedMode === "image-to-video" ? 1 : 2) : refCap;
        if (assetIds.length > cap) throw new SirayaApiError(400,"參考素材數量超過模型上限");
        const urls = await createGenerationAssetUrls(user.id, assetIds, req.nextUrl.origin);
        refs.push(...urls.map((url) => ({ type: "image" as const, url })));
      }
      if (Array.isArray(imageUrls)) {
        for (const u of imageUrls) {
          if (typeof u !== "string" || !u.trim()) throw new SirayaApiError(400,"參考素材格式不正確");
          if (u.trim()) {
            if (/^asset:/i.test(u.trim())) throw new SirayaApiError(400,"請從已審核素材選擇參考圖片");
            // data URLs (3D導演台 screenshot / sampled frames) are size-normalised here; signed URLs are normalised by the route that serves them
            refs.push({ type: "image" as const, url: await normalizeReferenceDataUrl(await resolveGenerationImage(user.id, u.trim(), req.nextUrl.origin)) });
          }
        }
      }
      // A recorded 3D導演台 運鏡 clip — reference-to-video (r2v) mode.
      // Seedance 2.0/2.5 only (verified live — see supportsVideoRefInput's
      // comment); silently dropped for other models the same way stale
      // image refs already are, rather than erroring the whole submission.
      if (typeof videoUrl === "string" && videoUrl.trim() && supportsVideoRefInput(String(body.model))) {
        refs.push({ type: "video", url: videoUrl.trim() });
      }
      if(frameMode && refs.some(r=>r.type!=="image")) throw new SirayaApiError(400,"首尾幀僅接受圖片");
      if (allowedModes.length) {
        try {
          Object.assign(videoBody, buildVideoModePayload({ model: String(body.model), mode: selectedMode as GenerationMode, prompt: String(body.prompt), seconds: body.seconds, aspectRatio: body.aspect_ratio, ...(frameMode ? {imageUrls: refs.map(r=>r.url)} : {references:[...refs,...trusted]}) }));
        } catch(e) { throw new SirayaApiError(400,e instanceof Error ? e.message : "生成模式不正確"); }
      } else {
        if (generationMode || trusted.length) throw new SirayaApiError(400,"此模型尚未支援所選模式");
        if (refs.length) videoBody.input_references = refs.slice(0, refCap);
      }
    } else if (assetIds?.length || imageUrls?.length || videoUrl || trusted.length) {
      throw new SirayaApiError(400,"此模型尚未開放所選生成模式");
    }


    const inFlight = await countInFlightVideoJobs(user.id);
    if (inFlight >= MAX_CONCURRENT_VIDEO_JOBS) {
      return NextResponse.json(
        {
          error: {
            message: `同時最多 ${MAX_CONCURRENT_VIDEO_JOBS} 個影片生成在跑，等其中一個完成後再試`,
            code: "too_many_concurrent",
          },
        },
        { status: 429 }
      );
    }

    const cost = await creditCost({
      kind: "video",
      model: String(body.model),
      seconds: Number(body.seconds) || 5,
      resolution: String(body.resolution || "480p"),
    });
    const balance = await getBalance(user.id);
    const confirmedCredits = req.headers.get("x-blue-wing-expected-credits");
    if ((draft === true && confirmedCredits === null) || (confirmedCredits !== null && (!/^\d+$/.test(confirmedCredits) || Number(confirmedCredits) !== cost))) {
      return NextResponse.json({ error: { message: "點數已變更，請重新預覽並確認", code: "stale_quote" } }, { status: 409 });
    }
    if (balance < cost) {
      return NextResponse.json(
        {
          error: {
            message: `點數不足：這次需要 ${cost} 點，你目前有 ${balance} 點。到「帳號」頁升級方案或請管理員加點。`,
            code: "insufficient_credits",
          },
          needCredits: true,
          cost,
          balance,
        },
        { status: 402 }
      );
    }

    // Reserve the client request before any paid I/O. Repeated requests return
    // the original reservation/job rather than replaying a costly provider call.
    let draftReservation: SeedanceDraftRow | null = null;
    if (draft === true) {
      const { rows } = await sql<SeedanceDraftRow>`insert into seedance_drafts
        (user_id,request_id,prompt,seconds,aspect_ratio,generate_audio,seed)
        values (${user.id},${clientRequestId}::uuid,${String(videoBody.prompt)},${Number(videoBody.seconds)},${String(videoBody.aspect_ratio || "16:9")},${videoBody.generate_audio !== false},${videoBody.seed ?? null})
        on conflict (user_id,request_id) do nothing returning *`;
      if (!rows[0]) {
        const existing = await sql<SeedanceDraftRow>`select * from seedance_drafts where user_id=${user.id} and request_id=${clientRequestId}::uuid limit 1`;
        return NextResponse.json({ id: existing.rows[0]?.job_id, status: existing.rows[0]?.status, duplicate: true,
          draft: existing.rows[0] ? await publicDraft(existing.rows[0]) : null, creditsSpent: 0 }, { status: 200 });
      }
      draftReservation = rows[0];
      videoBody.extra_body = { ...videoBody.extra_body, draft: true };
    }

    const submittedAt = Date.now();
    let submitted;
    try {
      submitted = await paidCall(
        user.id, cost, "video", String(body.model),
        async (chargeId) => {
          if (draftReservation) await sql`update seedance_drafts set charge_id=${chargeId} where id=${draftReservation.id} and user_id=${user.id}`;
          return createVideo(applyWatermarkDefaults({ ...videoBody, async: true }, "video"));
        },
        { units: Number(videoBody.seconds) || undefined, resolution: typeof videoBody.resolution === "string" ? videoBody.resolution : null }
      );
    } catch (err) {
      if (draftReservation) await sql`update seedance_drafts set status='failed' where id=${draftReservation.id} and user_id=${user.id}`;
      throw err;
    }
    const { result: json, chargeId } = submitted;

    // Async submissions return { id, status: "processing" }; a provider that
    // completes synchronously returns { data: [{ url }] } instead.
    const immediateUrl = json?.output_url ?? json?.data?.[0]?.url ?? null;
    const jobId = json?.id ?? null;

    if ((!immediateUrl && !jobId) || (draftReservation && !jobId)) {
      // HTTP 200 but neither a job to poll nor a finished video — no
      // exception was thrown, so paidCall's own refund never fired, and
      // nothing is left to reconcile this against later (no job id means
      // /api/videos/[id] has nothing to poll). Refund explicitly rather
      // than leaving this charged with literally no way to ever complete.
      await refundCharge(user.id, chargeId);
      if (draftReservation) await sql`update seedance_drafts set status='failed' where id=${draftReservation.id} and user_id=${user.id}`;
      return NextResponse.json({ error: { message: "提交失敗，SIRAYA 沒有回傳任務編號或結果" } }, { status: 502 });
    }

    if (draftReservation) {
      // Metadata failure cannot be safely replayed: the ledger still holds
      // the returned job ID, which can be reconciled by the polling route.
      await sql`update seedance_drafts set job_id=${jobId ? String(jobId) : null},status='processing'
        where id=${draftReservation.id} and user_id=${user.id}`;
    }

    // Charge on submission, tagged with the job id so /api/videos/[id] can
    // refund if the render ends up failing.

    // Providers that finish synchronously give us the url right away; async
    // jobs get recorded later by /api/videos/[id] once polling sees "completed".
    // Either way, re-host to our own storage first — the upstream url is
    // signed and expires (~24h), which would otherwise turn this generation
    // into a permanently broken video in 生成紀錄 once that window passes.
    //
    // Real gap found on re-audit (2026-09-07): unlike the async path (which
    // /api/videos/[id] can later refund if the job itself fails), a failure
    // in EITHER of these two calls — after the charge already succeeded —
    // had no reconciliation path at all: no job id to poll, nothing to
    // refund it later. Wrapped so a transient blob/DB failure here still
    // gives the credits back instead of a silent charge with nothing to
    // show for it.
    let persistedUrl = immediateUrl;
    if (immediateUrl) {
      try {
        persistedUrl = await persistGeneratedMedia(immediateUrl, { userId: user.id, kind: "video" });
        // Synchronous providers sometimes return only data[].url. Bind the
        // already finished result to a durable terminal reference rather than
        // leaving pending:UUID charged and occupying a slot for 24 hours.
        const generationRef = jobId ? String(jobId) : `completed:sync:${chargeId}`;
        if (!jobId) await sql`update credit_ledger set ref=${generationRef}
          where id=${chargeId} and user_id=${user.id} and reason='video' and delta<0`;
        await recordGeneration(user.id, {
          kind: "video",
          model: String(body.model),
          prompt: String(body.prompt),
          url: persistedUrl,
          durationMs: Date.now() - submittedAt,
          ref: generationRef,
        });
        if (draftReservation && jobId) await saveDraftReceipt(user.id, String(jobId), json, "completed", persistedUrl);
      } catch (err) {
        await refundCharge(user.id, chargeId);
        throw err;
      }
    }

    return NextResponse.json({
      id: jobId,
      status: json?.status ?? (immediateUrl ? "completed" : "processing"),
      url: persistedUrl,
      ...(draftReservation ? { draft: true } : { raw: json }),
      creditsSpent: cost,
      creditsBalance: balance - cost,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
