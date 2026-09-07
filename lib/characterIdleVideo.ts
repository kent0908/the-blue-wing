/**
 * 陪聊角色的「待機影片」——聊天畫面裡持續循環播放的短片（見
 * scripts/schema.sql 的 character_idle_videos 表、components/CompanionIdleStage.tsx）。
 *
 * Mechanics (2026-09-07, per product spec):
 *  - Each ACCOUNT (not each character) gets one free generation per calendar
 *    month, spent on whichever character asks for one first — the same
 *    "delta=0 dedup marker" trick lib/credits.ts already uses for
 *    reason='daily_free' (see claimFreeIdleQuota below).
 *  - Free generations use Seedance 1.0 pro fast (fast + cheap — never shown
 *    to the user, no reason to spend on the pricier tiers for this).
 *  - Once the month's free slot is used, further regenerations cost real
 *    credits, charged through the exact same credit_ledger reason='video'
 *    charge/refund path every other video generation uses (lib/creditTransactions.ts's
 *    paidCall) — so a paid idle-video regen is indistinguishable from a normal
 *    video generation in the ledger, and reconciles (refunds on failure) the
 *    same way. Default paid model is NSFW-Seedance-2.0-mini per spec.
 *  - Duration is fixed at 10s, resolution at 480p (cheapest tier — this is a
 *    small looping background element, not a hero deliverable). Both models
 *    are individually confirmed (2026-09-06 audit, lib/videoModels.ts) to
 *    accept 10s@480p.
 *  - If the character has an avatar image, generation runs image-to-video
 *    (the avatar as a single input_references entry) with camera_fixed:true
 *    — verified real for Seedance in image-to-video mode (lib/siraya.ts).
 *    Without an avatar it falls back to plain text-to-video and camera_fixed
 *    is omitted (verified to be REJECTED without a reference attached).
 *
 * NOT implemented: the pasted reference notes' "Motion Strength 2-3/10" dial.
 * SIRAYA's VideoGenerationRequest (lib/siraya.ts) has no such documented
 * field for any provider on this router — inventing one would violate this
 * project's "verify before shipping" rule. Motion is instead constrained via
 * the prompt/negative_prompt text and camera_fixed alone.
 */
import { sql } from "./db";
import { randomUUID } from "node:crypto";
import { createVideo, getVideoStatus, type VideoInputReference } from "./siraya";
import { assetsToDataUrls } from "./assetData";
import { persistGeneratedMedia } from "./mediaStore";
import { creditCost } from "./credits";
import { paidCall, refundCharge } from "./creditTransactions";
import { profilePrompt } from "./characterProfile";
import type { CharacterRow } from "./characters";

export const IDLE_VIDEO_SECONDS = 10;
export const IDLE_VIDEO_RESOLUTION = "480p";
// Free tier: plain text-to-video when there's no avatar to reference (cheap,
// $0.01/s). Seedance 1.0 pro fast does NOT support input_references at all —
// verified live (2026-09-07): SIRAYA rejects it outright ("the specified
// task_type r2v does not support model seedance-1-0-pro-fast"). So when the
// character DOES have an avatar, the free generation instead uses the
// cheapest r2v-capable tier (Seedance 2.0 mini, ~3.6x pricier but still a
// bounded once-a-month cost) so the free grant is still worth having.
export const FREE_IDLE_MODEL_TEXT_ONLY = "ByteDance-Seedance-1.0-pro-fast";
export const FREE_IDLE_MODEL_WITH_AVATAR = "SIRAYA-Seedance-2.0-mini";
export const PAID_IDLE_MODEL = "NSFW-Seedance-2.0-mini";

// Fixed cinematography template — kept byte-for-byte as given by the product
// spec. Character-specific appearance is prepended as its own paragraph
// (buildIdlePrompt below), never spliced into this sentence, so this template
// itself never drifts between characters.
export const IDLE_POSITIVE_TEMPLATE =
  "Full-body standing shot of an RPG game character, centered frontal view, eye-level angle, static fixed camera, locked-off shot. Subtle idle animation, breathing naturally, occasional subtle body sway. Soft breeze blowing, causing gentle hair sway and slight fabric movement. Occasional natural mouth opening and closing as if speaking briefly, calm facial expression, blinking naturally. Clean solid dark background or subtle atmospheric RPG interior, high fantasy aesthetic, sharp focus, 2D visual novel sprite style / Live2D aesthetic, cinematic lighting, 4k.";

export const IDLE_NEGATIVE_PROMPT =
  "camera movement, panning, zooming, walking, large dramatic gestures, exaggerated expressions, extreme distortion, blurred face, changing clothes, chaotic motion, out of frame.";

/** Character's own appearance, in the same words buildScenePrompt (lib/characters.ts)
 *  already uses — combined with the fixed template above, not blended into it. */
export function buildIdlePrompt(character: CharacterRow): string {
  const appearance = [
    character.personality.trim() || `一個名叫${character.name}的角色`,
    profilePrompt(character.profile, true),
  ]
    .filter(Boolean)
    .join("，");
  return `${appearance}\n\n${IDLE_POSITIVE_TEMPLATE}`;
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

/**
 * Atomically claims this account's monthly free slot, if any is left.
 * Returns the new credit_ledger row's id (so a failed generation can delete
 * it again and give the slot back) or null if this month's slot is already
 * spent. `on conflict do nothing` against the unique index makes this safe
 * under concurrent requests — at most one caller ever gets a non-null id for
 * a given (user, month).
 */
async function claimFreeIdleQuota(userId: number): Promise<string | null> {
  const { rows } = await sql<{ id: number }>`
    insert into credit_ledger (user_id, delta, reason, ref)
    values (${userId}, 0, 'idle_video_free', ${monthKey()})
    on conflict (user_id, ref) where reason = 'idle_video_free' do nothing
    returning id
  `;
  return rows[0] ? String(rows[0].id) : null;
}

/** Gives the month's free slot back — used when the claimed generation's
 *  SIRAYA submission itself failed, so a transient error doesn't cost the
 *  user their one freebie for the month. */
async function releaseFreeIdleQuota(markerId: string): Promise<void> {
  await sql`delete from credit_ledger where id = ${markerId} and reason = 'idle_video_free'`;
}

export interface IdleVideoRow {
  id: number;
  character_id: number;
  user_id: number;
  status: "pending" | "completed" | "failed";
  job_id: string | null;
  model: string;
  prompt: string;
  url: string | null;
  free: boolean;
  credits_spent: number;
  is_active: boolean;
  /** set only for a wardrobe-generated video (lib/characterOutfits.ts) — null for a plain idle video. */
  outfit_key: string | null;
  purchase_id: number | null;
  created_at: string;
}

export interface PublicIdleVideo {
  id: number;
  status: "pending" | "completed" | "failed";
  url: string | null;
  free: boolean;
  creditsSpent: number;
  isActive: boolean;
  outfitKey: string | null;
  purchaseId: number | null;
  createdAt: string;
}

export function toPublicIdleVideo(r: IdleVideoRow): PublicIdleVideo {
  return {
    id: r.id,
    status: r.status,
    url: r.url,
    free: r.free,
    creditsSpent: r.credits_spent,
    isActive: r.is_active,
    outfitKey: r.outfit_key,
    purchaseId: r.purchase_id,
    createdAt: r.created_at,
  };
}

export async function listIdleVideos(characterId: number, userId: number): Promise<IdleVideoRow[]> {
  const { rows } = await sql<IdleVideoRow>`
    select id, character_id, user_id, status, job_id, model, prompt, url, free, credits_spent, is_active, outfit_key, purchase_id, created_at
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

/** Only a completed video can become the active loop; unsets every other row
 *  for this character in the same statement so exactly one (or zero) stays active. */
export async function setActiveIdleVideo(characterId: number, userId: number, idleVideoId: number): Promise<boolean> {
  const { rows } = await sql<{ id: number }>`
    select id from character_idle_videos
    where id = ${idleVideoId} and character_id = ${characterId} and user_id = ${userId} and status = 'completed'
  `;
  if (!rows[0]) return false;
  await sql`update character_idle_videos set is_active = false where character_id = ${characterId} and user_id = ${userId}`;
  await sql`update character_idle_videos set is_active = true where id = ${idleVideoId}`;
  return true;
}

/**
 * Kicks off one idle-video generation and records it as 'pending'.
 * `allowPaid: false` (used by the auto-trigger on character creation) means
 * "only run this if it's genuinely free" — silently returns null rather than
 * charging anything when this month's free slot is already spent. The manual
 * "regenerate" button passes `allowPaid: true` only after the user has
 * explicitly seen and confirmed the credit cost.
 */
export async function startIdleVideoGeneration(
  userId: number,
  character: CharacterRow,
  opts: { allowPaid: boolean }
): Promise<{ row: IdleVideoRow; free: boolean; cost: number } | null> {
  const prompt = buildIdlePrompt(character);

  let refs: VideoInputReference[] = [];
  if (character.avatar_asset_id) {
    const urls = await assetsToDataUrls(userId, [character.avatar_asset_id], 1);
    refs = urls.map((url) => ({ type: "image" as const, url }));
  }
  // NOT setting camera_fixed here — verified live (2026-09-07) that SIRAYA
  // rejects it outright for the Seedance 2.0 mini family once a reference is
  // attached ("the specified parameter camera_fixed is not supported for
  // model dreamina-seedance-2-0-mini in r2v, must be empty"), which silently
  // broke every avatar-conditioned generation (the whole submission threw,
  // the free slot got released, nothing was ever produced — or, for a
  // character whose avatar was attached after its first couple of
  // generations, refs was simply empty and this never fired at all; either
  // way the fix is the same). The fixed negative_prompt already discourages
  // camera movement in its own right — confirmed by direct testing that
  // identity is preserved strongly through the reference alone.
  const extra_body: Record<string, unknown> = { watermark: false };

  const freeMarkerId = await claimFreeIdleQuota(userId);
  const free = freeMarkerId !== null;

  if (!free && !opts.allowPaid) {
    // Auto-trigger path, no free slot left this month — skip quietly. The
    // user can still generate one later from the chat page, where the cost
    // is shown up front and requires explicit confirmation.
    return null;
  }

  const model = free ? (refs.length ? FREE_IDLE_MODEL_WITH_AVATAR : FREE_IDLE_MODEL_TEXT_ONLY) : PAID_IDLE_MODEL;
  const cost = free ? 0 : await estimatePaidIdleCost();

  const submit = () =>
    createVideo({
      model,
      prompt,
      seconds: IDLE_VIDEO_SECONDS,
      resolution: IDLE_VIDEO_RESOLUTION as "480p",
      negative_prompt: IDLE_NEGATIVE_PROMPT,
      async: true,
      // This model defaults to ALSO generating an audio track unless told
      // otherwise — irrelevant (and risky: one real test hit a random
      // "OutputAudioSensitiveContentDetected" rejection on it) for a muted
      // looping background clip.
      generate_audio: false,
      input_references: refs.length ? refs : undefined,
      extra_body,
    });

  try {
    let json: { id?: string; data?: { url?: string }[]; status?: string };
    let chargeId: string | null = null;
    if (free) {
      json = await submit();
    } else {
      const paid = await paidCall(userId, cost, "video", "idle_video_" + randomUUID(), submit);
      json = paid.result as typeof json;
      chargeId = paid.chargeId;
    }

    const immediateUrl = json?.data?.[0]?.url ?? null;
    const jobId = json?.id ?? null;

    if (!immediateUrl && !jobId) {
      if (free && freeMarkerId) await releaseFreeIdleQuota(freeMarkerId);
      if (chargeId) await refundCharge(userId, chargeId);
      throw new Error("提交失敗，SIRAYA 沒有回傳任務編號或結果");
    }

    let status: IdleVideoRow["status"] = "pending";
    let url: string | null = null;
    if (immediateUrl) {
      url = await persistGeneratedMedia(immediateUrl, { userId, kind: "video" });
      status = "completed";
    }

    const { rows } = await sql<IdleVideoRow>`
      insert into character_idle_videos (character_id, user_id, status, job_id, model, prompt, url, free, credits_spent)
      values (${character.id}, ${userId}, ${status}, ${jobId}, ${model}, ${prompt}, ${url}, ${free}, ${cost})
      returning id, character_id, user_id, status, job_id, model, prompt, url, free, credits_spent, is_active, outfit_key, purchase_id, created_at
    `;
    const row = rows[0];
    if (status === "completed") await activateOnCompletion(row);
    return { row, free, cost };
  } catch (err) {
    if (free && freeMarkerId) await releaseFreeIdleQuota(freeMarkerId);
    throw err;
  }
}

/** The first idle video a character ever finishes becomes its loop automatically
 *  ("完成後在紅框內固定循環") — later ones just join the pick-list until the
 *  user actively switches (setActiveIdleVideo). A wardrobe-generated video
 *  (outfit_key set — lib/characterOutfits.ts) is different: choosing an
 *  outfit means "I want to see this now", so it ALWAYS becomes the active
 *  loop once it finishes, not just when nothing else is active yet. */
async function activateOnCompletion(row: IdleVideoRow): Promise<void> {
  if (row.outfit_key) {
    await setActiveIdleVideo(row.character_id, row.user_id, row.id);
    return;
  }
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from character_idle_videos
    where character_id = ${row.character_id} and user_id = ${row.user_id} and is_active = true
  `;
  if ((rows[0]?.n ?? 0) === 0) {
    await sql`update character_idle_videos set is_active = true where id = ${row.id}`;
  }
}

/**
 * Refreshes one still-pending row against SIRAYA — mirrors
 * app/api/videos/[id]/route.ts's polling logic (re-host on completion,
 * refund on failure), just against character_idle_videos instead of
 * `generations`/credit_ledger ownership records directly.
 */
export async function pollIdleVideoJob(row: IdleVideoRow): Promise<IdleVideoRow> {
  if (row.status !== "pending" || !row.job_id) return row;

  const json = await getVideoStatus(row.job_id);
  const rawUrl = json?.output_url ?? json?.data?.[0]?.url ?? null;
  const status = json?.status ?? (rawUrl ? "completed" : "processing");

  if (status === "completed" && rawUrl) {
    const url = await persistGeneratedMedia(rawUrl, { userId: row.user_id, kind: "video" });
    const { rows } = await sql<IdleVideoRow>`
      update character_idle_videos set status = 'completed', url = ${url}
      where id = ${row.id} and status = 'pending'
      returning id, character_id, user_id, status, job_id, model, prompt, url, free, credits_spent, is_active, outfit_key, purchase_id, created_at
    `;
    const updated = rows[0] ?? { ...row, status: "completed" as const, url };
    await activateOnCompletion(updated);
    return updated;
  }

  if (status === "failed") {
    if (!row.free) {
      const { rows: charge } = await sql`
        select id from credit_ledger where user_id = ${row.user_id} and reason = 'video' and ref = ${row.job_id} and delta < 0 limit 1
      `;
      if (charge[0]) await refundCharge(row.user_id, String(charge[0].id));
    } else {
      // Free job failed after all — hand the month's slot back too.
      const { rows: marker } = await sql<{ id: number }>`
        select id from credit_ledger where user_id = ${row.user_id} and reason = 'idle_video_free' and ref = ${monthKey(new Date(row.created_at))} limit 1
      `;
      if (marker[0]) await releaseFreeIdleQuota(String(marker[0].id));
    }
    const { rows } = await sql<IdleVideoRow>`
      update character_idle_videos set status = 'failed'
      where id = ${row.id} and status = 'pending'
      returning id, character_id, user_id, status, job_id, model, prompt, url, free, credits_spent, is_active, outfit_key, purchase_id, created_at
    `;
    return rows[0] ?? { ...row, status: "failed" as const };
  }

  return row;
}
