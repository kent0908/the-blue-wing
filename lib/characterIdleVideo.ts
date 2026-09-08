import { assertPromptSafety } from "./promptSafety";
/** Server-controlled 10-second avatar loops. Existing idle-video records and
 * monthly free quota remain compatible; pending reservation precedes paid I/O. */
import { sql } from "./db";

import { createVideo, getVideoStatus, SirayaApiError } from "./siraya";
import { assetsToDataUrls } from "./assetData";
import { persistGeneratedMedia } from "./mediaStore";
import { creditCost } from "./credits";
import { paidCall, refundCharge } from "./creditTransactions";
import { profilePrompt } from "./characterProfile";
import type { CharacterRow } from "./characters";

export const IDLE_VIDEO_SECONDS = 10;
export const IDLE_VIDEO_RESOLUTION = "480p";
export const FREE_IDLE_MODEL = "SIRAYA-Seedance-2.0-mini";
export const PAID_IDLE_MODEL = "NSFW-Seedance-2.0-mini";

// Fixed cinematography template — kept byte-for-byte as given by the product
// spec. Character-specific appearance is prepended as its own paragraph
// (buildIdlePrompt below), never spliced into this sentence, so this template
// itself never drifts between characters.
const IDLE_POSITIVE_TEMPLATE =
  "Vertical 9:16 full-body portrait of an RPG game character, character fills the frame from head to feet with minimal margins, centered frontal view, eye-level angle, static fixed camera, locked-off shot. Subtle idle animation, breathing naturally, occasional subtle body sway. Soft breeze blowing, causing gentle hair sway and slight fabric movement. Lips gently closed and relaxed throughout, no talking, no lip-sync, calm facial expression, blinking naturally. Clean solid dark background or subtle atmospheric RPG interior, high fantasy aesthetic, sharp focus, 2D visual novel sprite style / Live2D aesthetic, cinematic lighting, 4k.";

export const IDLE_NEGATIVE_PROMPT =
  "talking, speaking, lip-sync, mouth opening, horizontal composition, letterboxing, camera movement, panning, zooming, walking, large dramatic gestures, exaggerated expressions, extreme distortion, blurred face, changing clothes, chaotic motion, out of frame.";

/** Character's own appearance, in the same words buildScenePrompt (lib/characters.ts)
 *  already uses — combined with the fixed template above, not blended into it. */
export function buildIdlePrompt(character: CharacterRow): string {
  const appearance = [
    character.personality.trim() || `一個名叫${character.name}的角色`,
    profilePrompt(character.profile, true),
  ]
    .filter(Boolean)
    .join("，");
  return `${appearance}\n\n${IDLE_POSITIVE_TEMPLATE} Preserve the exact identity, outfit and proportions of the supplied reference image. The first and last frame must align for a smooth seamless 10-second loop. No text, logos or visible watermarks.`;
}

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

/** Read-only check — does this account still have this month's free idle-video
 *  generation available? Used by the GET route to show "免費" vs a credit cost
 *  before the user commits to anything. */
export async function hasFreeIdleQuota(userId: number): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from credit_ledger
    where user_id = ${userId} and reason = 'idle_video_free' and ref = ${monthKey()}
  `;
  return (rows[0]?.n ?? 0) === 0;
}

export async function estimatePaidIdleCost(): Promise<number> {
  return creditCost({ kind: "video", model: PAID_IDLE_MODEL, seconds: IDLE_VIDEO_SECONDS, resolution: IDLE_VIDEO_RESOLUTION });
}

export interface IdleVideoRow {
  id: number;
  character_id: number;
  user_id: number;
  status: "pending" | "completed" | "failed";
  job_id: string | null;
  source_url: string | null;
  model: string;
  prompt: string;
  url: string | null;
  free: boolean;
  credits_spent: number;
  is_active: boolean;
  created_at: string;
  free_marker_id: number | null;
  charge_id: number | null;
  refund_done: boolean;
}

export interface PublicIdleVideo {
  id: number;
  status: "pending" | "completed" | "failed";
  url: string | null;
  free: boolean;
  creditsSpent: number;
  isActive: boolean;
  createdAt: string;
  needsReview: boolean;
  message: string | null;
}

export function toPublicIdleVideo(r: IdleVideoRow): PublicIdleVideo {
  const needsReview = r.status === "pending" && !r.job_id && !r.source_url && Date.now() - new Date(r.created_at).getTime() > 10 * 60 * 1000;
  return {
    id: r.id,
    status: r.status,
    url: r.url,
    free: r.free,
    creditsSpent: r.credits_spent,
    isActive: r.is_active,
    createdAt: r.created_at,
    needsReview,
    message: needsReview ? "提交結果尚待確認，已保留原任務避免重複扣點，請聯絡管理員協助核對" : null,
  };
}

export async function listIdleVideos(characterId: number, userId: number): Promise<IdleVideoRow[]> {
  const { rows } = await sql<IdleVideoRow>`
    select *
    from character_idle_videos
    where character_id = ${characterId} and user_id = ${userId}
    order by created_at desc
  `;
  return rows;
}

export async function hasPendingIdleVideo(characterId: number, userId: number): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from character_idle_videos
    where character_id = ${characterId} and user_id = ${userId} and status = 'pending'
  `;
  return (rows[0]?.n ?? 0) > 0;
}

/** Lock the owned character so two concurrent switches cannot leave two active rows. */
export async function setActiveIdleVideo(characterId: number, userId: number, idleVideoId: number): Promise<boolean> {
  const c = await sql.connect();
  try {
    await c.query("begin");
    const owner = await c.query("select id from characters where id=$1 and user_id=$2 for update", [characterId,userId]);
    if (!owner.rows.length) { await c.query("rollback"); return false; }
    const valid = await c.query("select id from character_idle_videos where id=$1 and character_id=$2 and user_id=$3 and status='completed' and url is not null", [idleVideoId,characterId,userId]);
    if (!valid.rows.length) { await c.query("rollback"); return false; }
    await c.query("update character_idle_videos set is_active=false where character_id=$1 and user_id=$2", [characterId,userId]);
    await c.query("update character_idle_videos set is_active=true where id=$1 and character_id=$2 and user_id=$3", [idleVideoId,characterId,userId]);
    await c.query("commit"); return true;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

/** Reserve before contacting the provider. No free quota means allowPaid:false
 * is a no-op, even when two characters race for the same monthly allowance. */
export async function startIdleVideoGeneration(userId: number, character: CharacterRow, opts: { allowPaid: boolean }): Promise<{ row: IdleVideoRow; free: boolean; cost: number } | null> {
  if (!character.avatar_asset_id) throw new SirayaApiError(422, "請先選擇角色圖片，再生成待機影片");
  const owned = await sql`select id from assets where id=${character.avatar_asset_id} and user_id=${userId} and content_type like 'image/%'`;
  if (!owned.rows.length) throw new SirayaApiError(422, "角色圖片不存在或無法使用，請重新選擇素材");
  const urls = await assetsToDataUrls(userId, [Number(character.avatar_asset_id)], 1);
  if (urls.length !== 1) throw new SirayaApiError(422, "角色圖片無法讀取，請重新選擇素材");
  const paidCost = await estimatePaidIdleCost();
  const prompt = buildIdlePrompt(character);
  assertPromptSafety(prompt);
  const c = await sql.connect();
  let row: IdleVideoRow;
  try {
    await c.query("begin");
    const owner = await c.query("select id from characters where id=$1 and user_id=$2 for update", [character.id,userId]);
    if (!owner.rows.length) throw new SirayaApiError(404, "找不到這個角色");
    const pending = await c.query<IdleVideoRow>("select * from character_idle_videos where character_id=$1 and user_id=$2 and status='pending' limit 1", [character.id,userId]);
    if (pending.rows[0]) { await c.query("commit"); return { row:pending.rows[0],free:pending.rows[0].free,cost:pending.rows[0].credits_spent }; }
    const marker = await c.query<{id:number}>("insert into credit_ledger(user_id,delta,reason,ref) values($1,0,'idle_video_free',$2) on conflict(user_id,ref) where reason='idle_video_free' do nothing returning id", [userId,monthKey()]);
    const free = !!marker.rows[0];
    if (!free && !opts.allowPaid) { await c.query("rollback"); return null; }
    const created = await c.query<IdleVideoRow>("insert into character_idle_videos(character_id,user_id,status,model,prompt,free,credits_spent,free_marker_id) values($1,$2,'pending',$3,$4,$5,$6,$7) returning *", [character.id,userId,free?FREE_IDLE_MODEL:PAID_IDLE_MODEL,prompt,free,free?0:paidCost,marker.rows[0]?.id??null]);
    row = created.rows[0];
    await c.query("commit");
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }

  const submit = () => createVideo({ model:row.model,prompt:row.prompt,seconds:IDLE_VIDEO_SECONDS,resolution:IDLE_VIDEO_RESOLUTION,aspect_ratio:"9:16",
    negative_prompt:IDLE_NEGATIVE_PROMPT,generate_audio:false,async:true,input_references:[{type:"image",url:urls[0]}],extra_body:{watermark:false} });
  let chargeId: string | null = null;
  let providerAccepted = false;
  try {
    const paid = row.free ? {result:await submit(),chargeId:null} : await paidCall(userId,row.credits_spent,"video",row.model,submit);
    chargeId = paid.chargeId;
    const json = paid.result;
    const immediateUrl = json?.data?.[0]?.url ?? json?.output_url ?? null;
    const jobId = json?.id ?? null;
    if (!immediateUrl && !jobId) {
      if (chargeId) await refundCharge(userId,chargeId);
      throw new SirayaApiError(502,"生成服務沒有回傳任務或影片");
    }
    // Persist the provider job before downloading media. A transient download
    // failure can then be retried by GET without another paid generation.
    await sql`update character_idle_videos set job_id=${jobId},source_url=${immediateUrl},charge_id=${chargeId} where id=${row.id} and user_id=${userId}`;
    providerAccepted = true;
    row = {...row,job_id:jobId,source_url:immediateUrl,charge_id:chargeId?Number(chargeId):null};
    if (immediateUrl) {
      const url = await persistGeneratedMedia(immediateUrl,{userId,kind:"video"});
      const completed = await sql<IdleVideoRow>`update character_idle_videos set status='completed',url=${url} where id=${row.id} and user_id=${userId} returning *`;
      row = completed.rows[0];
      await autoActivateIfFirst(row);
      row = (await listIdleVideos(character.id,userId)).find(v=>Number(v.id)===Number(row.id)) ?? row;
    }
    return {row,free:row.free,cost:row.credits_spent};
  } catch (error) {
    if (!providerAccepted) {
      const failed = await sql<IdleVideoRow>`update character_idle_videos set status='failed',charge_id=${chargeId} where id=${row.id} and user_id=${userId} returning *`;
      if (failed.rows[0]) await reconcileIdleRefund(failed.rows[0]);
    }
    throw error;
  }
}

async function autoActivateIfFirst(row: IdleVideoRow): Promise<void> {
  const c = await sql.connect();
  try {
    await c.query("begin");
    await c.query("select id from characters where id=$1 and user_id=$2 for update", [row.character_id,row.user_id]);
    await c.query("update character_idle_videos set is_active=true where id=$1 and status='completed' and not exists(select 1 from character_idle_videos where character_id=$2 and user_id=$3 and is_active=true)", [row.id,row.character_id,row.user_id]);
    await c.query("commit");
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

/** Exact marker/charge binding and idempotent refund protect a newer free job
 * from an old failed poll. Legacy free records only match markers created
 * before the record itself, never a subsequently reclaimed allowance. */
async function reconcileIdleRefund(row: IdleVideoRow) {
  if (row.refund_done) return;
  if (row.free) {
    if (row.free_marker_id) await sql`delete from credit_ledger where id=${row.free_marker_id} and user_id=${row.user_id} and reason='idle_video_free'`;
    else await sql`delete from credit_ledger where user_id=${row.user_id} and reason='idle_video_free' and ref=${monthKey(new Date(row.created_at))} and created_at<=${row.created_at}`;
  } else {
    if (row.charge_id) await refundCharge(row.user_id,String(row.charge_id));
    else if (row.job_id) {
      const charge = await sql`select id from credit_ledger where user_id=${row.user_id} and reason='video' and ref=${row.job_id} and delta<0 limit 1`;
      if (charge.rows[0]) await refundCharge(row.user_id,String(charge.rows[0].id));
    }
  }
  await sql`update character_idle_videos set refund_done=true where id=${row.id} and user_id=${row.user_id}`;
}

export async function pollIdleVideoJob(row: IdleVideoRow): Promise<IdleVideoRow> {
  if (row.status === "failed") { await reconcileIdleRefund(row); return row; }
  if (row.status !== "pending" || (!row.job_id && !row.source_url)) return row;
  const json = row.source_url ? {status:"completed",output_url:row.source_url} : await getVideoStatus(row.job_id!);
  const rawUrl = json?.output_url ?? json?.data?.[0]?.url ?? null;
  const status = json?.status ?? (rawUrl?"completed":"processing");
  if (status === "completed" && rawUrl) {
    const url = await persistGeneratedMedia(rawUrl,{userId:row.user_id,kind:"video"});
    const result = await sql<IdleVideoRow>`update character_idle_videos set status='completed',url=${url} where id=${row.id} and user_id=${row.user_id} and status='pending' returning *`;
    const completed = result.rows[0] ?? (await listIdleVideos(row.character_id,row.user_id)).find(v=>Number(v.id)===Number(row.id));
    if (completed?.status === "completed") { await autoActivateIfFirst(completed); return completed; }
    return completed ?? row;
  }
  if (status === "failed") {
    const result = await sql<IdleVideoRow>`update character_idle_videos set status='failed' where id=${row.id} and user_id=${row.user_id} and status='pending' returning *`;
    const failed = result.rows[0] ?? (await listIdleVideos(row.character_id,row.user_id)).find(v=>Number(v.id)===Number(row.id));
    if (failed?.status === "failed") await reconcileIdleRefund(failed);
    return failed ?? row;
  }
  return row;
}
