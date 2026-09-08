import { authorizeSceneRequest } from "@/lib/companionGenerationAccess";
﻿import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { canUnlockScenes } from "@/lib/plans";
import { assetsToDataUrls } from "@/lib/assetData";
import { sql } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { getCharacter, listScenes, listMessages, levelInfo, toPublicScene } from "@/lib/characters";
import { buildSceneQuote } from "@/lib/characterSceneQuote";
import { claimSceneQuote, createSceneQuote, completeSceneRequest, failSceneRequest, getSceneRequest, isSceneRequestId, parseCharacterId, pendingSceneRequests, setSceneRequestResult, type SceneRequest } from "@/lib/characterSceneRequests";
import { POST as generateImage } from "@/app/api/images/route";
import { POST as generateVideo } from "@/app/api/videos/route";
import { GET as pollVideo } from "@/app/api/videos/[id]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function failure(status: number, message: string, code: string) {
  return NextResponse.json({ error: { message, code } }, { status });
}
function internalRequest(req: NextRequest, path: string, body?: object, expectedCredits?: number) {
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  if (body) headers.set("content-type", "application/json");
  if (expectedCredits !== undefined) headers.set("x-blue-wing-expected-credits", String(expectedCredits));
  return authorizeSceneRequest(new NextRequest(new URL(path, req.url), { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
}
function pendingResponse(request: SceneRequest) {
  if (request.status === "submitting" && !request.job_id && !request.output_url && Date.now() - new Date(request.created_at).getTime() > 10 * 60 * 1000) {
    return failure(409, "提交結果尚待確認，已保留原任務避免重複扣點，請聯絡管理員協助核對", "needs_reconciliation");
  }
  return NextResponse.json({ requestId: request.id, status: request.status === "submitting" ? "processing" : request.status, creditsSpent: request.credits_spent });
}
async function ownedAvatar(userId: number, assetId: number | null) {
  if (!assetId) return false;
  const { rows } = await sql`select id from assets where user_id=${userId} and id=${assetId} and content_type like 'image/%'`;
  return rows.length > 0;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  try {
    const id = parseCharacterId((await ctx.params).id);
    if (id === null) return failure(400, "角色 id 不正確", "bad_id");
    const character = await getCharacter(auth.user.id, id);
    if (!character) return failure(404, "找不到這個角色", "not_found");
    const requestId = req.nextUrl.searchParams.get("requestId");
    if (requestId !== null) {
      if (!isSceneRequestId(requestId)) return failure(400, "任務 id 不正確", "bad_id");
      const request = await getSceneRequest(auth.user.id, id, requestId);
      if (!request) return failure(404, "找不到場景任務", "not_found");
      if (request.status === "quoted") return failure(409, "請先確認預估點數，再開始生成", "confirmation_required");
      if (request.status === "failed") return failure(422, request.error_message || "生成失敗", "generation_failed");
      if (request.output_url) {
        const scene = await completeSceneRequest(request, request.output_url);
        return NextResponse.json({ requestId, status: "completed", scene: toPublicScene(scene), creditsSpent: request.credits_spent });
      }
      if (!request.job_id) return pendingResponse(request);
      const query = new URLSearchParams({ model: request.model, prompt: request.prompt });
      const response = await pollVideo(internalRequest(req, `/api/videos/${encodeURIComponent(request.job_id)}?${query}`), { params: Promise.resolve({ id: request.job_id }) });
      const result = await response.json();
      if (!response.ok) return NextResponse.json(result, { status: response.status });
      if (result.status === "failed") {
        await failSceneRequest(request, "影片生成失敗，點數已依生成服務規則退回");
        return failure(422, "影片生成失敗", "generation_failed");
      }
      if (result.status === "completed" && result.url) {
        const scene = await completeSceneRequest(request, result.url);
        return NextResponse.json({ requestId, status: "completed", scene: toPublicScene(scene), creditsSpent: request.credits_spent });
      }
      return pendingResponse(request);
    }
    const [scenes, pending, avatarReady] = await Promise.all([listScenes(id), pendingSceneRequests(auth.user.id, id), ownedAvatar(auth.user.id, character.avatar_asset_id)]);
    return NextResponse.json({ scenes: scenes.map(toPublicScene), unlocked: canUnlockScenes(auth.user.plan_code), eligible: levelInfo(character.affection).index >= 1,
      avatarAssetId: character.avatar_asset_id, avatarReady, reason: avatarReady ? null : "請先選擇資產庫中的角色圖片，才能生成專屬場景",
      pending: pending.map((r) => ({ requestId: r.id, kind: r.kind, status: "processing" })) });
  } catch (error) { return errorResponse(error); }
}

/** A quote is free. A separate confirmation of its owned, unexpired ID is
 * required before generation; no client-supplied model/prompt/URL is trusted. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  try {
    const id = parseCharacterId((await ctx.params).id);
    if (id === null) return failure(400, "角色 id 不正確", "bad_id");
    const character = await getCharacter(auth.user.id, id);
    if (!character) return failure(404, "找不到這個角色", "not_found");
    if (!canUnlockScenes(auth.user.plan_code)) return failure(403, "解鎖角色專屬場景需要高階方案", "plan_required");
    if (levelInfo(character.affection).index < 1) return failure(403, "尚未解鎖關係階段，請先提升好感度", "not_eligible");
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["kind", "action", "quoteId"].includes(key)) || !["image", "video"].includes(body.kind) || !["quote", "generate"].includes(body.action)) return failure(400, "請先預覽點數並確認，素材與生成設定由伺服器決定", "bad_request");
    if (!await ownedAvatar(auth.user.id, character.avatar_asset_id)) return failure(422, "請先選擇資產庫中的角色圖片", "avatar_required");
    const spec = await buildSceneQuote(character, body.kind, await listMessages(id, 8));
    if (body.action === "quote") {
      if (body.quoteId !== undefined) return failure(400, "預覽請求不接受既有報價 id", "bad_request");
      const quote = await createSceneQuote(auth.user.id, character, spec);
      return NextResponse.json({ quote: { id: quote.id, kind: quote.kind, model: quote.model, credits: quote.credits_quoted,
        seconds: quote.seconds, resolution: quote.resolution, summary: quote.summary, expiresAt: quote.expires_at } });
    }
    if (typeof body.quoteId !== "string" || !isSceneRequestId(body.quoteId)) return failure(400, "請先預覽點數並確認", "confirmation_required");
    const quoted = await getSceneRequest(auth.user.id, id, body.quoteId);
    if (!quoted || quoted.kind !== body.kind) return failure(404, "找不到這個場景預覽", "quote_not_found");
    if (quoted.status !== "quoted") {
      if (quoted.status === "failed") return failure(409, "上次生成失敗，請重新預覽後確認", "stale_quote");
      if (quoted.output_url) {
        const scene = await completeSceneRequest(quoted, quoted.output_url);
        return NextResponse.json({ requestId: quoted.id, status: "completed", scene: toPublicScene(scene), creditsSpent: quoted.credits_spent });
      }
      return pendingResponse(quoted);
    }
    if (!quoted.expires_at || new Date(quoted.expires_at).getTime() <= Date.now() || quoted.model !== spec.model || Number(quoted.credits_quoted) !== spec.credits || Number(quoted.avatar_asset_id) !== Number(spec.avatarAssetId) || quoted.level_index !== spec.levelIndex || quoted.prompt !== spec.prompt || quoted.summary !== spec.summary || quoted.seconds !== spec.seconds || quoted.resolution !== spec.resolution) {
      return failure(409, "點數、角色或對話內容已變更，請重新預覽並確認", "stale_quote");
    }
    const references = await assetsToDataUrls(auth.user.id, [Number(character.avatar_asset_id)], 1);
    if (references.length !== 1) return failure(422, "角色圖片無法讀取，請重新選擇素材", "avatar_unavailable");
    const claimed = await claimSceneQuote(auth.user.id, id, quoted.id);
    if (!claimed) return failure(409, "已有場景正在生成，或預覽已過期，請重新整理", "already_pending");
    const { request, created } = claimed;
    if (!created) return pendingResponse(request);
    const generationBody = request.kind === "image"
      ? { model: request.model, prompt: request.prompt, n: 1, size: "2048x2048", response_format: "url", image: references[0], watermark: false }
      : { model: request.model, prompt: request.prompt, seconds: request.seconds, resolution: request.resolution, imageUrls: references, generate_audio: false, extra_body: { watermark: false } };
    let response: Response;
    try {
      response = await (request.kind === "image" ? generateImage : generateVideo)(internalRequest(req, request.kind === "image" ? "/api/images" : "/api/videos", generationBody, request.credits_quoted));
    } catch (error) {
      await failSceneRequest(request, "生成服務暫時無法處理，請稍後再試");
      throw error;
    }
    const result = await response.json();
    if (!response.ok) {
      await failSceneRequest(request, result?.error?.message || "生成失敗");
      return NextResponse.json(result, { status: response.status });
    }
    const url = request.kind === "image" ? result.images?.[0]?.url : result.url;
    const jobId = request.kind === "video" ? result.id : undefined;
    if (!url && !jobId) {
      await failSceneRequest(request, "沒有取得生成結果");
      return failure(422, "沒有取得生成結果", "empty_generation");
    }
    await setSceneRequestResult(request, { url, jobId, creditsSpent: result.creditsSpent ?? 0 });
    if (url) {
      const scene = await completeSceneRequest(request, url);
      return NextResponse.json({ requestId: request.id, status: "completed", scene: toPublicScene(scene), creditsSpent: result.creditsSpent ?? 0 }, { status: 201 });
    }
    return NextResponse.json({ requestId: request.id, status: "processing", creditsSpent: result.creditsSpent ?? 0 }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}
