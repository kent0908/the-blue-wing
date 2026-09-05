import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { canUnlockScenes } from "@/lib/plans";
import { generationExistsForUrl } from "@/lib/generations";
import {
  getCharacter,
  listScenes,
  addScene,
  buildScenePrompt,
  levelInfo,
  toPublicScene,
} from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recommended models for a milestone scene — Seedream supports reference
 *  images (image() field) for the still, Seedance 2.5 has the highest
 *  input_references cap for the clip. Both accept the character's own
 *  avatar asset as a reference via the same assetIds path the rest of the
 *  app already uses (see /api/images, /api/videos). */
const SCENE_IMAGE_MODEL = "ByteDance-Seedream-4.5";
const SCENE_VIDEO_MODEL = "SIRAYA-Seedance-2.5";

function parseId(id: string) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) ? n : null;
}

/**
 * GET /api/characters/:id/scenes
 * Returns existing unlocked scenes plus the suggested prompt/model for each
 * kind — the client uses that suggestion to call the existing /api/images or
 * /api/videos, then POSTs the result back here to record it as a scene.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

  const character = await getCharacter(r.user.id, id);
  if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

  const scenes = await listScenes(id);
  const level = levelInfo(character.affection);

  return NextResponse.json({
    scenes: scenes.map(toPublicScene),
    unlocked: canUnlockScenes(r.user.plan_code),
    // Needs at least one level-up — a brand new 初次見面 character has no
    // "moment" worth turning into a scene yet.
    eligible: level.index >= 1,
    avatarAssetId: character.avatar_asset_id,
    suggested: {
      image: { prompt: buildScenePrompt(character, "image"), model: SCENE_IMAGE_MODEL },
      video: { prompt: buildScenePrompt(character, "video"), model: SCENE_VIDEO_MODEL },
    },
  });
}

/**
 * POST /api/characters/:id/scenes — body: { kind, url, prompt, model }
 * Records a scene already generated via /api/images or /api/videos (that's
 * where credits were charged and the media re-hosted) as belonging to this
 * character's milestone gallery. Gated server-side on plan tier — this is
 * the actual enforcement point for "高階方案專屬", independent of whatever
 * the UI shows.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  if (!canUnlockScenes(r.user.plan_code)) {
    return NextResponse.json(
      { error: { message: "解鎖角色專屬場景需要高階方案，請先升級。", code: "plan_required" } },
      { status: 403 }
    );
  }

  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });

  const character = await getCharacter(r.user.id, id);
  if (!character) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });

  const level = levelInfo(character.affection);
  if (level.index < 1) {
    return NextResponse.json(
      { error: { message: "還沒解鎖任何關係階段，多聊聊再回來生成場景吧", code: "not_eligible" } },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === "video" ? "video" : body?.kind === "image" ? "image" : null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!kind || !url) {
    return NextResponse.json({ error: { message: "缺少必要欄位", code: "bad_request" } }, { status: 400 });
  }

  // The credit charge and media re-hosting already happened in /api/images or
  // /api/videos, which also records every result into `generations` — confirm
  // this url is really one of those, not an arbitrary client-supplied string,
  // so a "scene" always corresponds to a generation the user actually paid for.
  if (!(await generationExistsForUrl(r.user.id, url))) {
    return NextResponse.json(
      { error: { message: "找不到對應的生成紀錄，請先透過上面的按鈕生成圖片或影片", code: "not_a_generation" } },
      { status: 422 }
    );
  }

  const prompt = typeof body?.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : buildScenePrompt(character, kind);
  const model =
    typeof body?.model === "string" && body.model.trim()
      ? body.model.trim()
      : kind === "video"
        ? SCENE_VIDEO_MODEL
        : SCENE_IMAGE_MODEL;

  const scene = await addScene(id, r.user.id, { kind, levelIndex: level.index, url, prompt, model });
  return NextResponse.json({ scene: toPublicScene(scene) }, { status: 201 });
}
