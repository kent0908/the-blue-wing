import { NextRequest, NextResponse } from "next/server";
import { createVideo } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, addCredits, creditCost } from "@/lib/credits";
import { recordGeneration } from "@/lib/generations";
import { assetsToDataUrls } from "@/lib/assetData";
import { maxRefsForVideoModel } from "@/lib/videoModels";

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

    // reference materials: client sends its own asset id(s); resolve to base64
    // data URLs (the blob store is private) and forward as input_references.
    // Only Seedance models are known to support this on SIRAYA — cap at that
    // model's documented limit regardless of what the client asked for.
    const { assetIds, imageUrl, ...videoBody } = body;
    const refCap = maxRefsForVideoModel(String(body.model));
    if (refCap > 0 && Array.isArray(assetIds) && assetIds.length) {
      const urls = await assetsToDataUrls(user.id, assetIds.map(Number), refCap);
      if (urls.length) {
        videoBody.input_references = urls.map((url) => ({ type: "image" as const, url }));
      }
    } else if (refCap > 0 && typeof imageUrl === "string" && imageUrl.trim()) {
      // 智慧畫布 (canvas) node-chaining: a prior node's own generated-image URL
      // isn't in the user's asset library, so it can't go through assetIds —
      // forward it straight through as a reference instead.
      videoBody.input_references = [{ type: "image" as const, url: imageUrl.trim() }];
    }

    // Seedance also puts a visible "AI generated" badge on the output unless
    // told otherwise — verified empirically (extra_body.watermark:false vs
    // true, compared frame-by-frame). That's only confirmed for the Seedance
    // family, though — other video providers routed through SIRAYA (Veo,
    // Sora, ...) aren't, and the same lesson from /api/images applies: some
    // providers reject an unrecognised param outright rather than ignoring
    // it. `refCap > 0` doubles as "is this a Seedance model" (see
    // lib/videoModels.ts) since only that family has any RULES entry at all.
    if (refCap > 0) {
      const clientExtra = (videoBody.extra_body as Record<string, unknown> | undefined) || {};
      videoBody.extra_body = { ...clientExtra, watermark: clientExtra.watermark ?? false };
    } else if (videoBody.extra_body && typeof videoBody.extra_body === "object") {
      const rest = { ...(videoBody.extra_body as Record<string, unknown>) };
      delete rest.watermark;
      videoBody.extra_body = rest;
    }

    const json = await createVideo({ ...videoBody, async: true });

    // Async submissions return { id, status: "processing" }; a provider that
    // completes synchronously returns { data: [{ url }] } instead.
    const immediateUrl = json?.data?.[0]?.url ?? null;
    const jobId = json?.id ?? null;

    // Charge on submission, tagged with the job id so /api/videos/[id] can
    // refund if the render ends up failing.
    await addCredits(user.id, -cost, "video", jobId ? String(jobId) : String(body.model));

    // Providers that finish synchronously give us the url right away; async
    // jobs get recorded later by /api/videos/[id] once polling sees "completed".
    if (immediateUrl) {
      await recordGeneration(user.id, {
        kind: "video",
        model: String(body.model),
        prompt: String(body.prompt),
        url: immediateUrl,
        ref: jobId ? String(jobId) : null,
      });
    }

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
