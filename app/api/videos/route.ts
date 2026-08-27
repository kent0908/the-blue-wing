import { NextRequest, NextResponse } from "next/server";
import { createVideo } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";

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
  try {
    const body = await req.json();
    if (!body?.model || !body?.prompt) {
      return NextResponse.json(
        { error: { message: "`model` and `prompt` are required.", type: "invalid_request_error", code: 400 } },
        { status: 400 }
      );
    }

    const json = await createVideo({ ...body, async: true });

    // Async submissions return { id, status: "processing" }; a provider that
    // completes synchronously returns { data: [{ url }] } instead.
    const immediateUrl = json?.data?.[0]?.url ?? null;
    return NextResponse.json({
      id: json?.id ?? null,
      status: json?.status ?? (immediateUrl ? "completed" : "processing"),
      url: immediateUrl,
      raw: json,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
