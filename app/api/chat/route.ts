import { NextRequest, NextResponse } from "next/server";
import { createChatCompletion, createChatCompletionStream } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, addCredits, creditCost } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 * Body: { model, messages, stream?, temperature?, max_tokens? }
 * Proxies POST https://llm.siraya.ai/v1/chat/completions
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

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

    const cost = creditCost({ kind: "text", model: String(body.model), maxTokens: Number(body.max_tokens) || 1024 });
    const balance = await getBalance(user.id);
    if (balance < cost) {
      return NextResponse.json(
        {
          error: { message: `點數不足：這次需要 ${cost} 點，你目前有 ${balance} 點。`, code: "insufficient_credits" },
          needCredits: true,
          cost,
          balance,
        },
        { status: 402 }
      );
    }

    if (body.stream) {
      // streaming: charge upfront since token usage isn't observable here
      await addCredits(user.id, -cost, "text", String(body.model));
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
    await addCredits(user.id, -cost, "text", String(body.model));
    return NextResponse.json({ ...json, creditsSpent: cost, creditsBalance: balance - cost });
  } catch (err) {
    return errorResponse(err);
  }
}
