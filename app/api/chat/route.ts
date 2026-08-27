import { NextRequest, NextResponse } from "next/server";
import { createChatCompletion, createChatCompletionStream } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 * Body: { model, messages, stream?, temperature?, max_tokens? }
 * Proxies POST https://llm.siraya.ai/v1/chat/completions
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.model || !Array.isArray(body?.messages)) {
      return NextResponse.json(
        {
          error: {
            message: "`model` and `messages` are required.",
            type: "invalid_request_error",
            code: 400,
          },
        },
        { status: 400 }
      );
    }

    if (body.stream) {
      const upstream = await createChatCompletionStream(body);
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const json = await createChatCompletion(body);
    return NextResponse.json(json);
  } catch (err) {
    return errorResponse(err);
  }
}
