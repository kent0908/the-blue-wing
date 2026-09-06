import { NextRequest, NextResponse } from "next/server";
import { getVideoStatus } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { refundCharge } from "@/lib/creditTransactions";
import { recordGeneration } from "@/lib/generations";
import { persistGeneratedMedia } from "@/lib/mediaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/videos/{id}
 * Proxies GET https://llm.siraya.ai/v1/videos/{video_id} for async polling.
 * If the job has failed, refund the credits that were charged at submission
 * (once — guarded by a `video_refund` ledger row keyed to the same job id).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  try {
    const { id } = await ctx.params;
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) {
      return NextResponse.json({ error: { message: "無效的任務編號" } }, { status: 400 });
    }
    const { rows: owned } = await sql`
      select 1 from credit_ledger
      where user_id = ${user.id} and reason = 'video' and ref = ${id} and delta < 0
      limit 1
    `;
    if (!owned.length) {
      return NextResponse.json({ error: { message: "找不到任務" } }, { status: 404 });
    }
    const json = await getVideoStatus(id);
    const rawUrl = json?.output_url ?? json?.data?.[0]?.url ?? null;
    const status = json?.status ?? (rawUrl ? "completed" : "processing");
    let url = rawUrl;

    if (status === "completed" && rawUrl) {
      // Re-host to our own storage first — this is a signed upstream URL
      // that expires (~24h); recording it as-is would leave the video
      // playable for a day and then permanently broken in 生成紀錄. Only
      // persist once (recordGeneration's own dedupe-on-ref means a second
      // poll after this would otherwise just re-upload the same video again).
      const { rows: already } = await sql<{ url: string | null }>`
        select url from generations where user_id = ${user.id} and ref = ${id} limit 1
      `;
      if (already[0]?.url) {
        url = already[0].url;
      } else {
        url = await persistGeneratedMedia(rawUrl, { userId: user.id, kind: "video" });
      }

      // The submit route only knows the url for synchronous providers; async
      // jobs are recorded here instead, the first time a poll sees "completed"
      // (recordGeneration dedupes on ref, so repeat polls are harmless).
      const model = req.nextUrl.searchParams.get("model");
      const prompt = req.nextUrl.searchParams.get("prompt");
      if (model && prompt) {
        await recordGeneration(user.id, { kind: "video", model, prompt, url, ref: id });
      }
    }

    if (status === "failed") {
      const { rows } = await sql`select id from credit_ledger where user_id=${user.id} and reason='video' and ref=${id} and delta<0 limit 1`;
      if(rows[0]) await refundCharge(user.id,String(rows[0].id));
    }
    return NextResponse.json({ id, status, url, raw: json });
  } catch (err) {
    return errorResponse(err);
  }
}

