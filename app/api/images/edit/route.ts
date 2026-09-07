import { validateGeneration } from "@/lib/generationValidation";
import { paidCall, refundCharge } from "@/lib/creditTransactions";
import { NextRequest, NextResponse } from "next/server";
import { createImageEdit } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, creditCost } from "@/lib/credits";
import { persistGeneratedMedia } from "@/lib/mediaStore";
import { recordGeneration } from "@/lib/generations";
import { sniffImageMimeFromBase64 } from "@/lib/imageMime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The 圖層編輯 tool is fixed to this one model for now (see the ask that
// prompted it) — real, verified live against SIRAYA on 2026-09-06: both a
// plain edit and a masked edit against /v1/images/edits returned a real
// generated image. Not configurable client-side (yet) since nothing else
// in the live catalogue has been checked against this endpoint the same
// way — see lib/siraya.ts's ImageEditRequest comment.
const EDIT_MODEL = "Dola-Seedream-5.0-pro";

/**
 * POST /api/images/edit — a genuinely different SIRAYA endpoint from
 * /api/images (which proxies /images/generations): this proxies
 * /images/edits, which takes the source image(s) plus an optional mask
 * (transparent/white marks the region to change) and edits in place instead
 * of generating fresh from a prompt. Body: { prompt, image: dataUrl, mask?:
 * dataUrl }. Both image and mask travel as base64 data URLs straight from
 * the browser's own canvas — no asset-library/public-hosting step needed,
 * unlike the video-reference flow (this is a single reasonably-sized image,
 * not a multi-MB clip).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  try {
    const body = await req.json();
    const withModel = { ...body, model: EDIT_MODEL };
    validateGeneration(withModel, "imageEdit");

    const cost = await creditCost({ kind: "image", model: EDIT_MODEL, imageCount: 1 });
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

    const { result: json, chargeId } = await paidCall(user.id, cost, "image", EDIT_MODEL, () =>
      createImageEdit({
        model: EDIT_MODEL,
        prompt: String(body.prompt),
        image_urls: [String(body.image)],
        mask_url: body.mask ? String(body.mask) : undefined,
        // Not client-configurable here (this tool has no advanced-settings
        // panel) — always off, matching the "no watermark by default"
        // behaviour everywhere else. Found missing entirely in a real bug
        // hunt (2026-09-06): every real edit through this route came back
        // with a visible "AI generated" badge. A top-level `watermark`
        // field (like /images/generations uses) does nothing at all for
        // this endpoint — verified live; `extra_body.watermark` is what
        // actually works here — see ImageEditRequest's comment.
        extra_body: { watermark: false },
      })
    );

    const first = json?.data?.[0];
    const rawUrl = first?.url
      ? String(first.url)
      : first?.b64_json
        ? `data:${sniffImageMimeFromBase64(String(first.b64_json))};base64,${first.b64_json}`
        : null;
    if (!rawUrl) {
      // HTTP 200 but nothing usable — same real gap as /api/images (see its
      // comment): paidCall already reserved the charge, no exception was
      // thrown for it to auto-refund, so this must refund explicitly.
      await refundCharge(user.id, chargeId);
      return NextResponse.json({ error: { message: "編輯失敗，沒有取得結果圖片" } }, { status: 502 });
    }

    // Same gap as /api/images and /api/videos (see their comments, found on
    // the same 2026-09-07 re-audit): a failure in either call below, after
    // the charge above already succeeded, previously had no refund path.
    let url: string;
    try {
      url = await persistGeneratedMedia(rawUrl, { userId: user.id, kind: "image" });
      await recordGeneration(user.id, { kind: "image", model: EDIT_MODEL, prompt: String(body.prompt), url });
    } catch (err) {
      await refundCharge(user.id, chargeId);
      throw err;
    }

    return NextResponse.json({ url, creditsSpent: cost, creditsBalance: balance - cost });
  } catch (err) {
    return errorResponse(err);
  }
}
