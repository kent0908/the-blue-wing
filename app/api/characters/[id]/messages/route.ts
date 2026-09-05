import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { createChatCompletion } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { getBalance, addCredits, creditCost } from "@/lib/credits";
import {
  getCharacter,
  listMessages,
  addMessage,
  touchCharacter,
  getPersona,
  buildSystemPrompt,
} from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOKENS = 700;
// How much prior conversation rides along each turn — plenty for a companion
// chat without letting the prompt (and its token cost) grow unbounded.
const HISTORY_TURNS = 20;

function parseId(id: string) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) ? n : null;
}

/** GET /api/characters/:id/messages — full chat history with this character. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

  const character = await getCharacter(r.user.id, id);
  if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

  const rows = await listMessages(id);
  return NextResponse.json({
    messages: rows.map((m) => ({ id: String(m.id), role: m.role, content: m.content, createdAt: m.created_at })),
  });
}

/** POST /api/characters/:id/messages — body: { content }. Sends the message, returns the character's reply. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

  const character = await getCharacter(r.user.id, id);
  if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const content = String(body?.content ?? "").trim().slice(0, 4000);
  if (!content) {
    return NextResponse.json({ error: { message: "訊息不能是空的", code: "empty_message" } }, { status: 400 });
  }

  const cost = await creditCost({ kind: "text", model: character.model, maxTokens: MAX_TOKENS });
  const balance = await getBalance(r.user.id);
  if (balance < cost) {
    return NextResponse.json(
      { error: { message: `點數不足：這則訊息需要 ${cost} 點，你目前有 ${balance} 點。`, code: "insufficient_credits" } },
      { status: 402 }
    );
  }

  try {
    const [persona, history] = await Promise.all([getPersona(r.user.id), listMessages(id, HISTORY_TURNS)]);

    const messages = [
      { role: "system" as const, content: buildSystemPrompt(character, persona) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content },
    ];

    const json = await createChatCompletion({ model: character.model, messages, max_tokens: MAX_TOKENS });
    const reply = json?.choices?.[0]?.message?.content;
    if (!reply) {
      return NextResponse.json({ error: { message: "角色沒有回應，請再試一次", code: "empty_reply" } }, { status: 502 });
    }

    // Persist both sides only after a successful reply — a failed call leaves
    // no half-written turn behind.
    await addMessage(id, "user", content);
    const saved = await addMessage(id, "assistant", String(reply));
    await touchCharacter(id);
    await addCredits(r.user.id, -cost, "text", character.model);

    return NextResponse.json({
      reply: { id: String(saved.id), role: "assistant", content: saved.content, createdAt: saved.created_at },
      creditsSpent: cost,
      creditsBalance: balance - cost,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
