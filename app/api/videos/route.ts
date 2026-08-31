import { NextRequest, NextResponse } from "next/server";
import { createVideo } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, addCredits, creditCost } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    if (!body?.model || !body?.prompt) {
      return NextResponse.json(
        { error: { message: "`model` and `prompt` are required.", type: "invalid_request_error", code: 400 } },
        { status: 400 }
      );
    }

    const cost = await creditCost({
      kind: "video",
      model: String(body.model),
      seconds: Number(body.seconds) || 5,
    });
    const balance = await getBalance(user.id);
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

    const json = await createVideo({ ...body, async: true });

    // Async submissions return { id, status: "processing" }; a provider that
    // completes synchronously returns { data: [{ url }] } instead.
    const immediateUrl = json?.data?.[0]?.url ?? null;
    const jobId = json?.id ?? null;

    // Charge on submission, tagged with the job id so /api/videos/[id] can
    // refund if the render ends up failing.
    await addCredits(user.id, -cost, "video", jobId ? String(jobId) : String(body.model));

    return NextResponse.json({
      id: jobId,
      status: json?.status ?? (immediateUrl ? "completed" : "processing"),
      url: immediateUrl,
      raw: json,
      creditsSpent: cost,
      creditsBalance: balance - cost,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
