import { NextRequest, NextResponse } from "next/server";
import { createChatCompletion, type ChatMessage } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash-lite";
const MAX_TURNS = 20;
const MAX_CHARS = 1000;

const planLines = PLANS.map(
  (p) => `- ${p.name}（${p.code}）：${p.priceUSD === 0 ? "免費" : "$" + p.priceUSD + "/月"}，每月 ${p.monthlyCredits} 點。${p.blurb}`
).join("\n");

const SYSTEM = `你是 The Blue Wing（一個 AI 影片／圖片／文字創作平台）的客服助手。用使用者的語言回答（預設繁體中文），簡潔、友善、只講與本平台相關的事。

平台重點：
- 圖片生成：Seedream、Gemini、GPT-Image 等模型；可在輸入框旁「+ 素材」附參考圖做 image-to-image（Seedream / Gemini 支援）。
- 影片生成：Seedance、Veo 等，依秒數計費。
- 多輪對話、語音生成。
- 資產庫（/assets）：上傳、管理自己的素材圖。
- 帳號頁（/account）：查看點數餘額、點數紀錄、方案、改密碼。忘記密碼在登入頁點「忘記密碼」。
- 點數：每次生成依模型與張數／秒數扣點；實際花費以生成後回應為準。

方案：
${planLines}
目前金流尚未開放，付費方案請聯絡管理員開通。

不知道或超出範圍的問題，請建議使用者到 Discord 詢問或寄信給管理員。不要編造價格或功能。`;

/** POST /api/support-chat  { messages: {role,content}[] } — no auth, no credits. */
export async function POST(req: NextRequest) {
  try {
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
