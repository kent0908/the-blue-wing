import { NextRequest, NextResponse } from "next/server";
import { createImage, type ImageGenerationRequest } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, addCredits, creditCost } from "@/lib/credits";

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
    if (!body?.model || !body?.prompt) {
      return NextResponse.json(
        { error: { message: "`model` and `prompt` are required.", type: "invalid_request_error", code: 400 } },
        { status: 400 }
      );
    }

    const cost = creditCost({
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

    const json = await createImage(payload as unknown as ImageGenerationRequest);
    const images = (json?.data ?? []).map((d: Record<string, unknown>) => ({
      url: d.url ? String(d.url) : d.b64_json ? `data:image/png;base64,${d.b64_json}` : null,
      revisedPrompt: (d.revised_prompt as string) ?? null,
    }));

    if (!images.some((im: { url: string | null }) => im.url)) {
      // upstream returned nothing usable — don't charge
      return NextResponse.json({ images, created: json?.created ?? null, usage: json?.usage ?? null });
    }

    // charge only after a successful generation
    await addCredits(user.id, -cost, "image", String(body.model));
    const balanceAfter = balance - cost;

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
