import { NextRequest, NextResponse } from "next/server";
import { getVideoStatus } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { addCredits } from "@/lib/credits";
import { recordGeneration } from "@/lib/generations";

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
    const json = await getVideoStatus(id);
    const url = json?.output_url ?? json?.data?.[0]?.url ?? null;
    const status = json?.status ?? (url ? "completed" : "processing");

    if (status === "completed" && url) {
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
      const { rows } = await sql<{ delta: number; refunded: number }>`
        select
          coalesce((
            select delta from credit_ledger
            where user_id = ${user.id} and reason = 'video' and ref = ${id}
            limit 1
          ), 0)::int as delta,
          (
            select count(*)::int from credit_ledger
            where user_id = ${user.id} and reason = 'video_refund' and ref = ${id}
          ) as refunded
      `;
      const charge = rows[0];
      if (charge && charge.delta < 0 && charge.refunded === 0) {
        await addCredits(user.id, -charge.delta, "video_refund", id);
      }
    }

    return NextResponse.json({ id, status, url, raw: json });
  } catch (err) {
    return errorResponse(err);
  }
}
