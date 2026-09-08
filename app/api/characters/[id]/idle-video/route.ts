import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { getCharacter } from "@/lib/characters";
import {
  listIdleVideos,
  hasFreeIdleQuota,
  estimatePaidIdleCost,
  startIdleVideoGeneration,
  pollIdleVideoJob,
  toPublicIdleVideo,
} from "@/lib/characterIdleVideo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

/**
 * GET /api/characters/:id/idle-video
 * Returns this character's idle-video history plus whether the account still
 * has this month's free slot (so the UI can show "免費生成" vs a credit cost
 * before the user commits). Any still-pending row is polled against SIRAYA
 * first, so the list is always fresh without a separate poll endpoint.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  try {
    const id = parseId((await ctx.params).id);
    if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

    const character = await getCharacter(r.user.id, id);
    if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

    let rows = await listIdleVideos(id, r.user.id);
    const pending = rows.filter((v) => v.status === "pending" || (v.status === "failed" && !v.refund_done));
    if (pending.length) {
      await Promise.all(pending.map((v) => pollIdleVideoJob(v)));
      rows = await listIdleVideos(id, r.user.id);
    }

    const [freeAvailable, paidCost] = await Promise.all([hasFreeIdleQuota(r.user.id), estimatePaidIdleCost()]);

    return NextResponse.json({
      videos: rows.map(toPublicIdleVideo),
      freeAvailable,
      paidCost,
      hasAvatar: !!character.avatar_asset_id,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/characters/:id/idle-video — body: { confirmPaid?: boolean }
 * Starts one generation. If this month's free slot is already spent, the
 * caller must resubmit with confirmPaid:true (the client shows the exact
 * credit cost from GET first) — never charges without that explicit confirmation.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  try {
    const id = parseId((await ctx.params).id);
    if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

    const character = await getCharacter(r.user.id, id);
    if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "confirmPaid") || (body.confirmPaid !== undefined && typeof body.confirmPaid !== "boolean")) {
      return NextResponse.json({ error: { message: "僅接受付費確認，模型、素材及動畫設定由伺服器決定", code: "bad_request" } }, { status: 400 });
    }
    const confirmPaid = body.confirmPaid === true;

    const free = await hasFreeIdleQuota(r.user.id);
    if (!free && !confirmPaid) {
      const cost = await estimatePaidIdleCost();
      return NextResponse.json(
        {
          error: { message: `這個月的免費額度已經用掉了，重新生成需要 ${cost} 點`, code: "needs_confirm" },
          needsConfirm: true,
          cost,
        },
        { status: 402 }
      );
    }

    const started = await startIdleVideoGeneration(r.user.id, character, { allowPaid: confirmPaid });
    if (!started) {
      // Only reachable if free quota got spent by a concurrent request
      // between the check above and here — ask the client to re-check.
      return NextResponse.json(
        { error: { message: "免費額度剛好被用掉了，請重新整理再試", code: "quota_race" } },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { video: toPublicIdleVideo(started.row), free: started.free, cost: started.cost },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
