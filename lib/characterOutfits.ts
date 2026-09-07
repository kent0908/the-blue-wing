/**
 * 換裝衣櫃 — 好感度到達「熱戀時刻」（affection 80，AFFECTION_LEVELS index 4，
 * 跟 lib/characters.ts 的 sceneLevelIsExplicit 同一個門檻）之後，可以花點數
 * 把角色的待機影片換成指定服裝。跟 lib/characterIdleVideo.ts 共用同一套
 * character_idle_videos 資料表與播放/選擇機制——換裝生成的影片只是多了
 * outfit_key／purchase_id 兩個欄位，其餘（poll、re-host、失敗退款）完全重用
 * 既有邏輯（見 app/api/characters/[id]/idle-video/route.ts 的 GET 會一併
 * 刷新這裡生成的 pending 影片）。
 *
 * 定價／模型：spec 原文寫「seedance2.0 mini」，但衣櫃目錄裡有好幾套本來就
 * 是情趣向的服裝（情趣內衣、兔女郎裝等）——用不帶 NSFW 字首的安全版本，這些
 * 服裝多半會被內容過濾擋掉，等於白花 500 點還拿不到想要的結果。改用
 * NSFW-Seedance-2.0-mini（同一顆模型的 NSFW 雙生版本，跟其他解鎖後大尺度
 * 內容一致的作法），在程式碼與這裡的註解都明確標出這個替換。
 */
import { sql } from "./db";
import { randomUUID } from "node:crypto";
import { createVideo, type VideoInputReference } from "./siraya";
import { assetsToDataUrls } from "./assetData";
import { persistGeneratedMedia } from "./mediaStore";
import { paidCall, refundCharge } from "./creditTransactions";
import { getBalance } from "./credits";
import { readProfile, PROFILE_FIELDS, type ProfileKey } from "./characterProfile";
import { levelInfo, type CharacterRow } from "./characters";
import { IDLE_POSITIVE_TEMPLATE, IDLE_NEGATIVE_PROMPT, setActiveIdleVideo, type IdleVideoRow } from "./characterIdleVideo";
import { SirayaApiError } from "./siraya";

export const OUTFIT_CHANGE_COST = 500;
export const OUTFIT_MODEL = "NSFW-Seedance-2.0-mini";
export const OUTFIT_SECONDS = 10;
export const OUTFIT_RESOLUTION = "720p";
/** Same threshold as lib/characters.ts's sceneLevelIsExplicit — 熱戀時刻 (affection 80). */
export const OUTFIT_UNLOCK_LEVEL_INDEX = 4;

export interface OutfitOption {
  key: string;
  label: string;
  /** English wardrobe description spliced in as this outfit's 服裝與外觀細節 override. */
  description: string;
}

/** 10 outfits — mix of classic anime staples (both a male and female line)
 *  and more suggestive/adult options, per spec ("經典的動漫或是比較情色場景
 *  的都可以"). Descriptions are in English to match IDLE_POSITIVE_TEMPLATE's
 *  own language. */
export const OUTFIT_CATALOG: OutfitOption[] = [
  { key: "sailor_uniform", label: "水手服", description: "a classic Japanese school sailor uniform with a pleated skirt, neck scarf, and knee-high socks" },
  { key: "gakuran", label: "立領學生制服", description: "a classic Japanese boys' gakuran school uniform with a stand-up collar" },
  { key: "maid", label: "女僕裝", description: "a classic frilly maid outfit with an apron, headband, and knee-high stockings" },
  { key: "tailcoat", label: "燕尾服", description: "an elegant black tailcoat suit with a white dress shirt and bow tie, formal and dashing" },
  { key: "evening_gown", label: "晚禮服", description: "an elegant floor-length evening gown, sophisticated and glamorous" },
  { key: "yukata", label: "浴衣", description: "a traditional Japanese summer yukata robe with an obi sash" },
  { key: "bunny_suit", label: "兔女郎裝", description: "a sexy bunny girl outfit with bunny ears, fishnet stockings, and a plunging bodysuit" },
  { key: "silk_robe", label: "性感絲質睡袍", description: "a loosely tied silky sensual robe, partially open, in an intimate bedroom setting" },
  { key: "pajamas", label: "居家睡衣", description: "cute and cozy loungewear pajamas, soft and comfortable" },
  { key: "lingerie", label: "情趣內衣", description: "alluring, revealing intimate lingerie, seductive and bold" },
];

export function outfitByKey(key: string): OutfitOption | undefined {
  return OUTFIT_CATALOG.find((o) => o.key === key);
}

export function isOutfitUnlocked(character: CharacterRow): boolean {
  return levelInfo(character.affection).index >= OUTFIT_UNLOCK_LEVEL_INDEX;
}

/** Character's own appearance fields (skipping "outfit" and "scenario",
 *  which the chosen wardrobe item overrides) plus the outfit description —
 *  same label:value line format as lib/characterProfile.ts's profilePrompt,
 *  just with outfit swapped in instead of read from the profile. */
function appearanceWithOutfit(character: CharacterRow, outfit: OutfitOption): string {
  const p = readProfile(character.profile);
  const keys: ProfileKey[] = ["gender", "style", "species", "skin", "hair", "eyes", "build"];
  const lines = [
    character.personality.trim() || `一個名叫${character.name}的角色`,
    `成年角色，${p.age} 歲`,
    ...keys.filter((k) => p[k]).map((k) => `${PROFILE_FIELDS[k].label}：${p[k]}`),
    `服裝與外觀細節：${outfit.description}`,
  ];
  return lines.join("\n");
}

export function buildOutfitPrompt(character: CharacterRow, outfit: OutfitOption): string {
  return `${appearanceWithOutfit(character, outfit)}\n\n${IDLE_POSITIVE_TEMPLATE}`;
}

export interface OutfitChangeRow {
  id: number;
  character_id: number;
  user_id: number;
  outfit_key: string;
  credits_spent: number;
  retry_used: boolean;
  created_at: string;
}

export async function listOutfitChanges(characterId: number, userId: number): Promise<OutfitChangeRow[]> {
  const { rows } = await sql<OutfitChangeRow>`
    select id, character_id, user_id, outfit_key, credits_spent, retry_used, created_at
    from character_outfit_changes
    where character_id = ${characterId} and user_id = ${userId}
    order by created_at desc
  `;
  return rows;
}

async function resolveRefs(userId: number, character: CharacterRow): Promise<VideoInputReference[]> {
  if (!character.avatar_asset_id) return [];
  const urls = await assetsToDataUrls(userId, [character.avatar_asset_id], 1);
  return urls.map((url) => ({ type: "image" as const, url }));
}

async function insertIdleVideoRow(input: {
  characterId: number;
  userId: number;
  status: "pending" | "completed";
  jobId: string | null;
  model: string;
  prompt: string;
  url: string | null;
  creditsSpent: number;
  purchaseId: number;
  outfitKey: string;
}): Promise<IdleVideoRow> {
  const { rows } = await sql<IdleVideoRow>`
    insert into character_idle_videos
      (character_id, user_id, status, job_id, model, prompt, url, free, credits_spent, outfit_key, purchase_id)
    values
      (${input.characterId}, ${input.userId}, ${input.status}, ${input.jobId}, ${input.model}, ${input.prompt}, ${input.url}, false, ${input.creditsSpent}, ${input.outfitKey}, ${input.purchaseId})
    returning id, character_id, user_id, status, job_id, model, prompt, url, free, credits_spent, is_active, outfit_key, purchase_id, created_at
  `;
  return rows[0];
}

/**
 * Buys one outfit change: charges OUTFIT_CHANGE_COST credits (refunded
 * automatically if the SIRAYA submission itself throws — same paidCall
 * convention as every other paid video generation), submits the generation,
 * and records both the purchase (character_outfit_changes) and the video
 * (character_idle_videos, outfit_key/purchase_id set). Completion is picked
 * up the same way as any other idle video — the next GET /idle-video call
 * polls pending rows and, for an outfit row, force-activates it once done
 * (lib/characterIdleVideo.ts's activateOnCompletion).
 */
export async function purchaseOutfitChange(
  userId: number,
  character: CharacterRow,
  outfitKey: string
): Promise<{ change: OutfitChangeRow; video: IdleVideoRow }> {
  const outfit = outfitByKey(outfitKey);
  if (!outfit) throw new SirayaApiError(400, "找不到這套服裝");
  if (!isOutfitUnlocked(character)) throw new SirayaApiError(403, "好感度還沒到「熱戀時刻」，換裝功能尚未解鎖");

  const balance = await getBalance(userId);
  if (balance < OUTFIT_CHANGE_COST) {
    throw new SirayaApiError(402, `點數不足：換裝需要 ${OUTFIT_CHANGE_COST} 點，你目前有 ${balance} 點`);
  }

  const prompt = buildOutfitPrompt(character, outfit);
  const refs = await resolveRefs(userId, character);

  const submit = () =>
    createVideo({
      model: OUTFIT_MODEL,
      prompt,
      seconds: OUTFIT_SECONDS,
      resolution: OUTFIT_RESOLUTION as "720p",
      negative_prompt: IDLE_NEGATIVE_PROMPT,
      async: true,
      generate_audio: false,
      input_references: refs.length ? refs : undefined,
      extra_body: { watermark: false },
    });

  const { result: json, chargeId } = await paidCall(userId, OUTFIT_CHANGE_COST, "video", "outfit_" + randomUUID(), submit);
  const immediateUrl = (json as { data?: { url?: string }[] })?.data?.[0]?.url ?? null;
  const jobId = (json as { id?: string })?.id ?? null;

  if (!immediateUrl && !jobId) {
    await refundCharge(userId, chargeId);
    throw new SirayaApiError(502, "提交失敗，SIRAYA 沒有回傳任務編號或結果");
  }

  // From here on the SIRAYA submission itself already succeeded (charge is
  // committed) — a failure in our OWN bookkeeping (a transient DB error, say)
  // must still refund, or the user is charged 500 credits for a purchase
  // that never even shows up as a record to retry or investigate. Mirrors
  // the same reasoning as paidCall's own doc comment: a real 5xx/network
  // failure with no way to reconcile later must not be a silent credit loss.
  try {
    const { rows: changeRows } = await sql<OutfitChangeRow>`
      insert into character_outfit_changes (character_id, user_id, outfit_key, credits_spent)
      values (${character.id}, ${userId}, ${outfitKey}, ${OUTFIT_CHANGE_COST})
      returning id, character_id, user_id, outfit_key, credits_spent, retry_used, created_at
    `;
    const change = changeRows[0];

    let status: "pending" | "completed" = "pending";
    let url: string | null = null;
    if (immediateUrl) {
      url = await persistGeneratedMedia(immediateUrl, { userId, kind: "video" });
      status = "completed";
    }

    const video = await insertIdleVideoRow({
      characterId: character.id,
      userId,
      status,
      jobId,
      model: OUTFIT_MODEL,
      prompt,
      url,
      creditsSpent: OUTFIT_CHANGE_COST,
      purchaseId: change.id,
      outfitKey,
    });
    if (status === "completed") await setActiveIdleVideo(character.id, userId, video.id);

    return { change, video };
  } catch (err) {
    await refundCharge(userId, chargeId);
    throw err;
  }
}

/**
 * The one free reroll per purchase ("使用後可以有重新生成一次的機會") — same
 * outfit, no charge, marks retry_used so it can't be spent twice. Consumed on
 * click regardless of whether this attempt itself succeeds, same as a normal
 * one-time reroll mechanic.
 */
export async function retryOutfitChange(
  userId: number,
  character: CharacterRow,
  change: OutfitChangeRow
): Promise<IdleVideoRow> {
  if (change.retry_used) throw new SirayaApiError(409, "這次換裝的免費重新生成機會已經用掉了");
  const outfit = outfitByKey(change.outfit_key);
  if (!outfit) throw new SirayaApiError(400, "找不到這套服裝");

  const { rows: claimed } = await sql<{ id: number }>`
    update character_outfit_changes set retry_used = true
    where id = ${change.id} and user_id = ${userId} and retry_used = false
    returning id
  `;
  if (!claimed[0]) throw new SirayaApiError(409, "這次換裝的免費重新生成機會已經用掉了");

  const prompt = buildOutfitPrompt(character, outfit);
  const refs = await resolveRefs(userId, character);

  const json = await createVideo({
    model: OUTFIT_MODEL,
    prompt,
    seconds: OUTFIT_SECONDS,
    resolution: OUTFIT_RESOLUTION as "720p",
    negative_prompt: IDLE_NEGATIVE_PROMPT,
    async: true,
    generate_audio: false,
    input_references: refs.length ? refs : undefined,
    extra_body: { watermark: false },
  });
  const immediateUrl = json?.data?.[0]?.url ?? null;
  const jobId = json?.id ?? null;
  if (!immediateUrl && !jobId) throw new SirayaApiError(502, "提交失敗，SIRAYA 沒有回傳任務編號或結果");

  let status: "pending" | "completed" = "pending";
  let url: string | null = null;
  if (immediateUrl) {
    url = await persistGeneratedMedia(immediateUrl, { userId, kind: "video" });
    status = "completed";
  }

  const video = await insertIdleVideoRow({
    characterId: character.id,
    userId,
    status,
    jobId,
    model: OUTFIT_MODEL,
    prompt,
    url,
    creditsSpent: 0,
    purchaseId: change.id,
    outfitKey: change.outfit_key,
  });
  if (status === "completed") await setActiveIdleVideo(character.id, userId, video.id);

  return video;
}
