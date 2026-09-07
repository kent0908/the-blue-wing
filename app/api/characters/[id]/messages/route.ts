import { paidCall, refundCharge } from "@/lib/creditTransactions";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { createChatCompletion } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { getBalance, creditCost } from "@/lib/credits";
import {
  getCharacter,
  listMessages,
  addMessage,
  getPersona,
  buildSystemPrompt,
  buildMemoryUpdatePrompt,
  matchesLikes,
  recordTurn,
  updateMemorySummary,
  levelInfo,
  MEMORY_REFRESH_EVERY,
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

    const { result: json, chargeId } = await paidCall(r.user.id, cost, "text", character.model, () =>
      createChatCompletion({ model: character.model, messages, max_tokens: MAX_TOKENS })
    );
    const reply = json?.choices?.[0]?.message?.content;
    if (!reply) {
      // HTTP 200 but no reply content — same real gap as /api/chat: paidCall
      // already reserved the charge, no exception was thrown for it to
      // auto-refund. Refund explicitly.
      await refundCharge(r.user.id, chargeId);
      return NextResponse.json({ error: { message: "角色沒有回應，請再試一次", code: "empty_reply" } }, { status: 502 });
    }

    // Persist both sides only after a successful reply — a failed call leaves
    // no half-written turn behind. Same refund gap as /api/chat (found on the
    // same 2026-09-07 re-audit) — a DB failure here, after the charge above
    // already succeeded, previously had no refund path.
    const gain = 1 + (matchesLikes(content, character.likes) ? 4 : 0);
    const before = levelInfo(character.affection);
    let saved: Awaited<ReturnType<typeof addMessage>>;
    let affection: number;
    let turnCount: number;
    try {
      await addMessage(id, "user", content);
      saved = await addMessage(id, "assistant", String(reply));
      const turn = await recordTurn(id, gain);
      affection = turn.affection;
      turnCount = turn.turnCount;
    } catch (err) {
      await refundCharge(r.user.id, chargeId);
      throw err;
    }
    const after = levelInfo(affection);

    // Long-term memory: every MEMORY_REFRESH_EVERY turns, compress the recent
    // conversation into the rolling summary. Never let this block or fail the
    // reply the user is waiting on — it's maintenance, not the main request.
    if (turnCount % MEMORY_REFRESH_EVERY === 0) {
      try {
        const recent = await listMessages(id, MEMORY_REFRESH_EVERY * 2);
        const memPrompt = buildMemoryUpdatePrompt(character, recent);
        const memJson = await createChatCompletion({
          model: character.model,
          messages: [{ role: "user", content: memPrompt }],
          max_tokens: 400,
        });
        const summary = memJson?.choices?.[0]?.message?.content;
        if (summary) await updateMemorySummary(id, String(summary));
      } catch (err) {
        console.error("character memory summary refresh failed:", err);
      }
    }

    return NextResponse.json({
      reply: { id: String(saved.id), role: "assistant", content: saved.content, createdAt: saved.created_at },
      creditsSpent: cost,
      creditsBalance: balance - cost,
      affection: {
        value: affection,
        gain,
        level: after.name,
        unlock: after.unlock,
        progressPct: after.progressPct,
        nextMin: after.nextMin,
        leveledUp: after.index > before.index,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

