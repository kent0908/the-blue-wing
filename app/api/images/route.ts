import { NextRequest, NextResponse } from "next/server";
import { createImage, type ImageGenerationRequest } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  try {
    const body = await req.json();
    if (!body?.model || !body?.prompt) {
      return NextResponse.json(
        { error: { message: "`model` and `prompt` are required.", type: "invalid_request_error", code: 400 } },
        { status: 400 }
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

    return NextResponse.json({ images, created: json?.created ?? null, usage: json?.usage ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
