import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { getCharacter } from "@/lib/characters";
import { listIdleVideos, pollIdleVideoJob, hasPendingIdleVideo, toPublicIdleVideo } from "@/lib/characterIdleVideo";
import { OUTFIT_CATALOG, OUTFIT_CHANGE_COST, isOutfitUnlocked, listOutfitChanges, purchaseOutfitChange } from "@/lib/characterOutfits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseId(id: string) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

/**
 * GET /api/characters/:id/outfits
 * Catalog + unlock state + this character's purchase history, each purchase
 * paired with its generated video(s) (matched by purchase_id) so the client
 * can show status/url/retry-availability without a second round trip.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  try {
    const id = parseId((await ctx.params).id);
    if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

    const character = await getCharacter(r.user.id, id);
    if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

    const [changes, videosRaw] = await Promise.all([listOutfitChanges(id, r.user.id), listIdleVideos(id, r.user.id)]);
    const pending = videosRaw.filter((v) => (v.status === "pending" || (v.status === "failed" && !v.refund_done)) && v.purchase_id !== null);
    if (pending.length) await Promise.all(pending.map((v) => pollIdleVideoJob(v)));
    const videos = pending.length ? await listIdleVideos(id, r.user.id) : videosRaw;

    const changesOut = changes.map((c) => ({
      id: c.id,
      outfitKey: c.outfit_key,
      creditsSpent: c.credits_spent,
      retryUsed: c.retry_used,
      createdAt: c.created_at,
      // Both ids are bigint columns, which come back from Postgres as
      // strings — compare numerically rather than relying on both sides
      // happening to stringify the same way.
      videos: videos.filter((v) => Number(v.purchase_id) === Number(c.id)).map(toPublicIdleVideo),
    }));

    return NextResponse.json({
      eligible: isOutfitUnlocked(character),
      cost: OUTFIT_CHANGE_COST,
      // imageUrl is always null for now — no admin-manageable preview image
      // system exists yet for outfits (unlike lib/landingMedia.ts's slots).
      // Wired through here so the client can already render one the moment
      // that exists, without another round of frontend changes.
      catalog: OUTFIT_CATALOG.map((o) => ({ key: o.key, label: o.label, imageUrl: null as string | null })),
      changes: changesOut,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/characters/:id/outfits — body: { outfitKey } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  try {
    const id = parseId((await ctx.params).id);
    if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

    const character = await getCharacter(r.user.id, id);
    if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

    const body = await req.json().catch(() => null);
    if(!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key=>key!=="outfitKey")) {
      return NextResponse.json({error:{message:"僅接受服裝選擇；角色、模型與費用由伺服器決定",code:"bad_request"}},{status:400});
    }
    const outfitKey = typeof body?.outfitKey === "string" ? body.outfitKey.trim() : "";
    if (!outfitKey) return NextResponse.json({ error: { message: "缺少服裝代碼", code: "bad_request" } }, { status: 400 });

    // Same guard as the plain idle-video regenerate route — without it,
    // nothing stops a second 500-credit purchase (or a regular idle-video
    // regen) from being submitted while an earlier one for this character is
    // still generating.
    if (await hasPendingIdleVideo(id, r.user.id)) {
      return NextResponse.json(
        { error: { message: "已經有一支影片正在生成中，請稍後再試", code: "already_pending" } },
        { status: 409 }
      );
    }

    const { change, video } = await purchaseOutfitChange(r.user.id, character, outfitKey);
    return NextResponse.json(
      {
        change: { id: change.id, outfitKey: change.outfit_key, creditsSpent: change.credits_spent, retryUsed: change.retry_used, createdAt: change.created_at },
        video: toPublicIdleVideo(video),
      },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
