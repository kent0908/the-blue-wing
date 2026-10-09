import { recordProviderReceipt } from "@/lib/crm";
import { observeBillingStream } from "@/lib/providerReceipt";
import { validateGeneration } from "@/lib/generationValidation";
import { paidCall, refundCharge } from "@/lib/creditTransactions";
import { NextRequest, NextResponse } from "next/server";
import { createChatCompletion, createChatCompletionStream, SirayaApiError } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/apiauth";
import { getBalance, creditCost } from "@/lib/credits";
import { recordGeneration } from "@/lib/generations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Must exceed CHAT_TIMEOUT_MS in lib/siraya.ts so the provider abort — and
// the refund it triggers — happens inside the function, not after it dies.
export const maxDuration = 60;

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
    validateGeneration(body, "text");
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

    const cost = await creditCost({ kind: "text", model: String(body.model), maxTokens: Number(body.max_tokens) || 1024 });
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
      const { result: upstream, chargeId } = await paidCall(user.id, cost, "text", String(body.model), () => createChatCompletionStream(body));
      if (!upstream.body) {
        await refundCharge(user.id, chargeId);
        throw new SirayaApiError(502,"生成失敗，沒有取得文字回覆");
      }
      return new Response(observeBillingStream(upstream.body, receipt => recordProviderReceipt(user.id, chargeId, receipt), () => refundCharge(user.id, chargeId)), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const { result: json, chargeId } = await paidCall(user.id, cost, "text", String(body.model), () => createChatCompletion(body));

    const replyText = json?.choices?.[0]?.message?.content;
    const lastUserPrompt = [...body.messages].reverse().find((m: { role: string }) => m.role === "user")?.content;
    if (typeof replyText !== "string" || !replyText.trim()) {
      // HTTP 200 but no actual reply content (e.g. a moderation refusal
      // returned as an empty completion rather than an error) — same real
      // gap as /api/images: paidCall already reserved the charge, no
      // exception was thrown for it to auto-refund. Refund explicitly.
      await refundCharge(user.id, chargeId);
      return NextResponse.json({ error:{message:"生成失敗，沒有取得文字回覆"}, creditsSpent: 0, creditsBalance: await getBalance(user.id) },{status:502});
    }
    if (lastUserPrompt) {
      // Same class of gap as /api/images (lower stakes here — text costs are
      // tiny — but consistent to fix): a DB failure recording this reply,
      // after the charge above already succeeded, previously had no refund.
      try {
        await recordGeneration(user.id, {
          kind: "text",
          model: String(body.model),
          prompt: String(lastUserPrompt),
          text: String(replyText),
        });
      } catch (err) {
        await refundCharge(user.id, chargeId);
        throw err;
      }
    }

    return NextResponse.json({ ...json, creditsSpent: cost, creditsBalance: await getBalance(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}


