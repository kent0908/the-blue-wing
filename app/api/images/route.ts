import { LAYER_DECOMPOSITION_AVAILABLE, LAYER_DECOMPOSITION_UNAVAILABLE_REASON } from "@/lib/layerCapability";
import { MAX_LAYER_OUTPUTS, validateLayerInput, parseLayerResponse } from "@/lib/layerDecomposition";
import { saveLayerSet } from "@/lib/layerSets";
import { SirayaApiError } from "@/lib/siraya";
import { assertModelAccess } from "@/lib/companionGenerationAccess";
import { validateGeneration } from "@/lib/generationValidation";
import { paidCall, refundCharge, settleCharge } from "@/lib/creditTransactions";
import { NextRequest, NextResponse } from "next/server";
import { createImage, type ImageGenerationRequest } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, creditCost } from "@/lib/credits";
import { assetsToDataUrls } from "@/lib/assetData";
import { persistGeneratedMedia } from "@/lib/mediaStore";
import { MAX_REF_IMAGES } from "@/lib/imageModels";
import { recordGeneration } from "@/lib/generations";
import { applyWatermarkDefaults } from "@/lib/watermark";
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
  "layer_decomposition",
  "output_format",
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
    if(body?.layer_decomposition === true && !LAYER_DECOMPOSITION_AVAILABLE) return NextResponse.json({error:{message:LAYER_DECOMPOSITION_UNAVAILABLE_REASON,code:"layer_metadata_unavailable"}},{status:503});
    assertModelAccess(req, body?.model);
    validateGeneration(body, "image");
    const isLayers = body.layer_decomposition === true;
    if (!body?.model || (!body?.prompt && !isLayers)) {
      return NextResponse.json(
        { error: { message: "`model` and `prompt` are required.", type: "invalid_request_error", code: 400 } },
        { status: 400 }
      );
    }

    const cost = await creditCost({
      kind: "image",
      model: String(body.model),
      imageCount: isLayers ? MAX_LAYER_OUTPUTS : Number(body.n) || 1,
    });
    if(isLayers && body.confirmedMaxCredits !== cost) throw new SirayaApiError(409,"請確認圖層分離最高預扣點數後再生成");
    const balance = await getBalance(user.id);
    const confirmedCredits = req.headers.get("x-blue-wing-expected-credits");
    if (confirmedCredits !== null && (!/^\d+$/.test(confirmedCredits) || Number(confirmedCredits) !== cost)) {
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

    const payload = {} as Record<string, unknown>;
    for (const key of ALLOWED) {
      if (body[key] !== undefined) payload[key] = body[key];
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

    if(isLayers){
      if(refs.length!==1)throw new SirayaApiError(400,"圖層分離需選擇一張原圖");
      validateLayerInput(refs[0]);
      payload.size ??= "2K";payload.output_format="png";delete payload.n;
      const unitCost=cost/MAX_LAYER_OUTPUTS;
      const {result}=await paidCall(user.id,cost,"image_layers",String(body.model),async(chargeId)=>{
        const json=await createImage(applyWatermarkDefaults(payload as unknown as ImageGenerationRequest,"image"));
        const layers=parseLayerResponse(json?.data);
        for(const layer of layers){
          layer.url=await persistGeneratedMedia(layer.url,{userId:user.id,kind:"image"});
          if(!layer.url.startsWith('/api/media/'))throw new SirayaApiError(502,"圖層儲存失敗，已取消本次扣點，請稍後重試");
        }
        const creditsSpent=layers.length*unitCost;
        const creditsRefunded=await settleCharge(user.id,chargeId,creditsSpent);
        const layerSetId=await saveLayerSet(user.id,String(body.model),String(body.prompt??''),layers,creditsSpent);
        return {layers,layerSetId,creditsSpent,creditsRefunded,created:json.created??null};
      });
      return NextResponse.json({...result,images:result.layers.map(l=>({url:l.url})),reservedCredits:cost,creditsBalance:await getBalance(user.id)});
    }

    const { result: json, chargeId } = await paidCall(user.id, cost, "image", String(body.model), () =>
      createImage(applyWatermarkDefaults(payload as unknown as ImageGenerationRequest, "image"))
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


