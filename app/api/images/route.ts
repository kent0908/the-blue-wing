import { validateGeneration } from "@/lib/generationValidation";
import { paidCall, refundCharge } from "@/lib/creditTransactions";
import { NextRequest, NextResponse } from "next/server";
import { createImage, type ImageGenerationRequest } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, creditCost } from "@/lib/credits";
import { assetsToDataUrls } from "@/lib/assetData";
import { persistGeneratedMedia } from "@/lib/mediaStore";
import { MAX_REF_IMAGES, getImageModelForControls, supportsWatermarkControl } from "@/lib/imageModels";
import { recordGeneration } from "@/lib/generations";
import { sniffImageMimeFromBase64 } from "@/lib/imageMime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby caps this at 60s; Pro honours up to 300s. Slow models
// (gpt-image-2, gemini-3-pro-image) routinely need >60s and will only
// complete on Pro — on Hobby they time out and the client shows a hint.
export const maxDuration = 300;

/** Keys forwarded upstream — anything else in the body is ignored. */
const ALLOWED: (keyof ImageGenerationRequest)[] = [
  "model",
  "prompt",
  "n",
  "size",
  "quality",
  "style",
  "response_format",
  "negative_prompt",
  "seed",
  "background",
  "output_compression",
  "moderation",
  "watermark",
];

/**
 * POST /api/images
 * Proxies POST https://llm.siraya.ai/v1/images/generations
 * Normalises the response into { images: [{ url }] } — b64_json payloads are
 * converted to data URLs so the client can render either shape uniformly.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  try {
    const body = await req.json();
    validateGeneration(body, "image");
    if (!body?.model || !body?.prompt) {
      return NextResponse.json(
        { error: { message: "`model` and `prompt` are required.", type: "invalid_request_error", code: 400 } },
        { status: 400 }
      );
    }

    const cost = await creditCost({
      kind: "image",
      model: String(body.model),
      imageCount: Number(body.n) || 1,
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

    const payload = {} as Record<string, unknown>;
    for (const key of ALLOWED) {
      if (body[key] !== undefined) payload[key] = body[key];
    }

    // Seedream defaults to a visible "AI generated" watermark unless told
    // otherwise (docs claim default false, but real output disagrees —
    // verified empirically). Other families do NOT "ignore it harmlessly" —
    // GPT Image 2 proxies straight to OpenAI's own API, which rejects unknown
    // parameters outright ("Unknown parameter: 'watermark'"). Only forward
    // the field for families verified to accept it; strip it otherwise, even
    // if the client sent one (defense in depth — see AdvancedParams.tsx for
    // the client-side gating). getImageModelForControls (not getImageModel)
    // since this is a real-behavior question, not a display one — an
    // "NSFW-"-prefixed Seedream id is still Seedream underneath and still
    // accepts this field; a real bug hunt (2026-09-06) found this used
    // plain getImageModel() and so was silently stripping watermark control
    // for every NSFW-* image model regardless of what the client sent.
    const imgModel = getImageModelForControls(String(body.model));
    if (supportsWatermarkControl(imgModel)) {
      if (payload.watermark === undefined) payload.watermark = false;
    } else {
      delete payload.watermark;
    }

    // reference image(s): can come from the user's own asset library
    // (assetIds — resolved to base64 data URLs here, since the blob store is
    // private) and/or plain URLs (智慧畫布 node-chaining: a prior node's own
    // generated-image output isn't in the asset library, so it can't go
    // through assetIds — SIRAYA's `image` field accepts a plain URL directly,
    // fetched upstream on SIRAYA's side, not ours). Both can be present at
    // once (e.g. one Load Image node plus a chained Image-generation node
    // fanned into the same input) — combine them into one array. SIRAYA
    // accepts an array — verified empirically with two distinct reference
    // images producing a result that combined both.
    const refs: string[] = [];
    if (Array.isArray(body.assetIds) && body.assetIds.length) {
      refs.push(...(await assetsToDataUrls(user.id, body.assetIds.map(Number), MAX_REF_IMAGES)));
    }
    if (typeof body.image === "string" && body.image.trim()) {
      refs.push(body.image.trim());
    } else if (Array.isArray(body.image)) {
      refs.push(...body.image.filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0).map((u: string) => u.trim()));
    }
    const cappedRefs = refs.slice(0, MAX_REF_IMAGES);
    if (cappedRefs.length === 1) payload.image = cappedRefs[0];
    else if (cappedRefs.length > 1) payload.image = cappedRefs;

    const { result: json, chargeId } = await paidCall(user.id, cost, "image", String(body.model), () =>
      createImage(payload as unknown as ImageGenerationRequest)
    );
    const images = (json?.data ?? []).map((d: Record<string, unknown>) => ({
      url: d.url ? String(d.url) : d.b64_json ? `data:${sniffImageMimeFromBase64(String(d.b64_json))};base64,${d.b64_json}` : null,
      revisedPrompt: (d.revised_prompt as string) ?? null,
    }));

    if (!images.some((im: { url: string | null }) => im.url)) {
      // Upstream returned HTTP 200 but nothing usable — no exception for
      // paidCall to catch, so nothing was auto-refunded (a real gap found in
      // a 2026-09-06 audit: the comment here always SAID "don't charge", but
      // paidCall reserves the charge before this code ever runs, so it was
      // never actually rolled back). A soft moderation block is the most
      // likely real cause. Refund explicitly.
      await refundCharge(user.id, chargeId);
      return NextResponse.json({ images, created: json?.created ?? null, usage: json?.usage ?? null });
    }

    // charge only after a successful generation
    const balanceAfter = balance - cost;

    // Real gap found on re-audit (2026-09-07): a failure in EITHER call below
    // — after the charge above already succeeded — had no reconciliation
    // path (no job id to poll later, nothing to catch and refund it). Same
    // bug class as /api/videos's own immediate-completion branch. Wrapped so
    // a transient blob/DB failure here refunds instead of silently charging
    // for nothing.
    try {
      for (const im of images) {
        if (im.url) {
          // Re-host to our own storage: upstream `url` responses are signed
          // and expire (~24h), and b64_json responses are huge inline data
          // URLs — either way, persist once here so 生成紀錄 doesn't quietly
          // turn into a broken image later (or bloat every history payload).
          im.url = await persistGeneratedMedia(im.url, { userId: user.id, kind: "image" });
          await recordGeneration(user.id, { kind: "image", model: String(body.model), prompt: String(body.prompt), url: im.url });
        }
      }
    } catch (err) {
      await refundCharge(user.id, chargeId);
      throw err;
    }

    return NextResponse.json({
      images,
      created: json?.created ?? null,
      usage: json?.usage ?? null,
      creditsSpent: cost,
      creditsBalance: balanceAfter,
    });
  } catch (err) {
    return errorResponse(err);
  }
}


