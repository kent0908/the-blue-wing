import { requireUser } from "@/lib/apiauth";
import { limitRequest } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import { createChatCompletion, type ChatMessage } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { faqAsPlainText } from "@/lib/supportFaq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash-lite";
const MAX_TURNS = 20;
const MAX_CHARS = 1000;

// Same content the client renders as a browsable QA list
// (components/SupportChat.tsx) — one source of truth (lib/supportFaq.ts)
// instead of a hand-typed system prompt that quietly drifted out of date as
// the product grew (it never mentioned 智慧畫布、3D導演台、圖層編輯、
// 陪聊角色 at all). This is the fallback path for whatever a user types
// that isn't one of the canned questions.
const SYSTEM = `你是 The Blue Wing（一個 AI 影片／圖片／文字創作平台）的客服助手。用使用者的語言回答（預設繁體中文），簡潔、友善、只講與本平台相關的事。只根據下面的題庫內容回答，不要編造題庫沒提到的價格或功能；問到題庫沒有的東西，就老實說不確定，建議去 Discord 詢問或寄信給管理員。

題庫：
${faqAsPlainText()}`;

/** POST /api/support-chat  { messages: {role,content}[] } — no auth, no credits. */
export async function POST(req: NextRequest) {
  const auth=await requireUser(req); if("error" in auth)return auth.error;
  try {
    if(!await limitRequest("support:"+auth.user.id,20,86400))return NextResponse.json({error:{message:"今日客服額度已用完"}},{status:429});
    const body = await req.json().catch(() => ({}));
    const incoming: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    const clean = incoming
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

    if (!clean.length || clean[clean.length - 1].role !== "user") {
      return NextResponse.json({ error: { message: "缺少訊息", code: "bad_input" } }, { status: 400 });
    }

    const json = await createChatCompletion({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, ...clean],
      max_tokens: 512,
      temperature: 0.4,
    });
    const reply = json?.choices?.[0]?.message?.content ?? "抱歉，我現在無法回答，請稍後再試或到 Discord 詢問。";
    return NextResponse.json({ reply });
  } catch (err) {
    return errorResponse(err);
  }
}

