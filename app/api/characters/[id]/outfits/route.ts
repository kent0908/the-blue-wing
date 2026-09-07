import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { getCharacter } from "@/lib/characters";
import { listIdleVideos, pollIdleVideoJob, toPublicIdleVideo } from "@/lib/characterIdleVideo";
import { OUTFIT_CATALOG, OUTFIT_CHANGE_COST, isOutfitUnlocked, listOutfitChanges, purchaseOutfitChange } from "@/lib/characterOutfits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) ? n : null;
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
    const pending = videosRaw.filter((v) => v.status === "pending" && v.purchase_id !== null);
    if (pending.length) await Promise.all(pending.map((v) => pollIdleVideoJob(v)));
    const videos = pending.length ? await listIdleVideos(id, r.user.id) : videosRaw;

    const changesOut = changes.map((c) => ({
      id: c.id,
      outfitKey: c.outfit_key,
      creditsSpent: c.credits_spent,
      retryUsed: c.retry_used,
      createdAt: c.created_at,
      videos: videos.filter((v) => v.purchase_id === c.id).map(toPublicIdleVideo),
    }));

    return NextResponse.json({
      eligible: isOutfitUnlocked(character),
      cost: OUTFIT_CHANGE_COST,
      catalog: OUTFIT_CATALOG.map((o) => ({ key: o.key, label: o.label })),
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

    const body = await req.json().catch(() => ({}));
    const outfitKey = typeof body?.outfitKey === "string" ? body.outfitKey.trim() : "";
    if (!outfitKey) return NextResponse.json({ error: { message: "缺少服裝代碼", code: "bad_request" } }, { status: 400 });

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
