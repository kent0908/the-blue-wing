import { sql } from "./db";
import { createVideo, type VideoInputReference } from "./siraya";
import { assetsToDataUrls } from "./assetData";
import { persistGeneratedMedia } from "./mediaStore";
import { paidCall, refundCharge } from "./creditTransactions";
import { assertPromptSafety } from "./promptSafety";
import { sceneInteractionPolicy } from "./sceneInteractionPolicy";
import { readProfile, PROFILE_FIELDS, type ProfileKey } from "./characterProfile";
import { levelInfo, type CharacterRow } from "./characters";
import { IDLE_POSITIVE_TEMPLATE, IDLE_NEGATIVE_PROMPT, setActiveIdleVideo, pollIdleVideoJob, type IdleVideoRow } from "./characterIdleVideo";
import { SirayaApiError } from "./siraya";
import { OUTFIT_CHANGE_COST, OUTFIT_UNLOCK_LEVEL_INDEX } from "./companionConstants";

// Re-exported (data itself now lives in lib/companionConstants.ts, a
// dependency-free file client code can also import — e.g. lib/supportFaq.ts)
// so every existing `import { OUTFIT_CHANGE_COST } from "@/lib/characterOutfits"`
// keeps working.
export { OUTFIT_CHANGE_COST, OUTFIT_UNLOCK_LEVEL_INDEX };

export const OUTFIT_MODEL = "NSFW-Seedance-2.0-mini";
export const OUTFIT_SECONDS = 10;
export const OUTFIT_RESOLUTION = "720p";

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
  const appearance = appearanceWithOutfit(character, outfit);
  assertPromptSafety(appearance, character.profile?.boundaries);
  return `${appearance}\n\n${IDLE_POSITIVE_TEMPLATE} Preserve the supplied adult character's identity and proportions, changing only the requested wardrobe. First and last frames align for a seamless loop. Fully clothed, non-explicit fashion portrait.\n${sceneInteractionPolicy(character.affection)}`;
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
  if (!character.avatar_asset_id) throw new SirayaApiError(422, "請先選擇角色圖片，再生成換裝影片");
  const owned = await sql`select id from assets where id=${character.avatar_asset_id} and user_id=${userId} and content_type like 'image/%'`;
  if (!owned.rows.length) throw new SirayaApiError(422, "角色圖片不存在或無法使用");
  const urls = await assetsToDataUrls(userId, [character.avatar_asset_id], 1);
  if (urls.length !== 1) throw new SirayaApiError(422, "角色圖片無法讀取，請重新選擇素材");
  return urls.map((url) => ({ type: "image" as const, url }));
}

/** Lock and reserve the character before any provider call. Both purchase and
 * reroll share the same pending row guard as ordinary idle-video generation. */
async function reserveOutfit(userId:number, characterId:number, outfitKey:string, retryId?:number) {
  const c=await sql.connect();
  try {
    await c.query("begin");
    const owner=await c.query<CharacterRow>("select * from characters where id=$1 and user_id=$2 for update",[characterId,userId]);
    const character=owner.rows[0];
    if(!character)throw new SirayaApiError(404,"找不到這個角色");
    if(!isOutfitUnlocked(character))throw new SirayaApiError(403,"好感度需達到 80 才能使用換裝功能");
    const pending=await c.query("select id from character_idle_videos where character_id=$1 and user_id=$2 and status='pending' limit 1",[characterId,userId]);
    if(pending.rows.length)throw new SirayaApiError(409,"已經有一支影片正在生成中，請稍後再試");
    let change:OutfitChangeRow;
    if(retryId!==undefined) {
      const purchase=await c.query<OutfitChangeRow>("select * from character_outfit_changes where id=$1 and character_id=$2 and user_id=$3 for update",[retryId,characterId,userId]);
      if(!purchase.rows[0])throw new SirayaApiError(404,"找不到這次換裝紀錄");
      change=purchase.rows[0];outfitKey=change.outfit_key;
      if(change.retry_used)throw new SirayaApiError(409,"這次換裝的免費重新生成機會已經用掉了");
      // A refunded/failed purchase cannot produce a free generation. A reroll
      // belongs to a successfully delivered paid purchase, and is consumed once.
      const delivered=await c.query("select 1 from character_idle_videos v where v.purchase_id=$1 and v.user_id=$2 and v.character_id=$3 and v.status='completed' and v.credits_spent>0 and not exists(select 1 from credit_ledger r where r.user_id=v.user_id and ((r.reason='charge_refund' and r.ref=v.charge_id::text) or (r.reason='video_refund' and r.ref=v.job_id))) limit 1",[retryId,userId,characterId]);
      if(!delivered.rows.length)throw new SirayaApiError(409,"需先完成原換裝影片，失敗退費的購買不提供免費重生");
    } else {
      const created=await c.query<OutfitChangeRow>("insert into character_outfit_changes(character_id,user_id,outfit_key,credits_spent) values($1,$2,$3,$4) returning *",[characterId,userId,outfitKey,OUTFIT_CHANGE_COST]);
      change=created.rows[0];
    }
    const outfit=outfitByKey(outfitKey);
    if(!outfit)throw new SirayaApiError(400,"找不到這套服裝");
    const prompt=buildOutfitPrompt(character,outfit);
    if(retryId!==undefined) {
      await c.query("update character_outfit_changes set retry_used=true where id=$1 and user_id=$2 and character_id=$3",[retryId,userId,characterId]);
      change={...change,retry_used:true};
    }
    const created=await c.query<IdleVideoRow>("insert into character_idle_videos(character_id,user_id,status,model,prompt,free,credits_spent,outfit_key,purchase_id) values($1,$2,'pending',$3,$4,false,$5,$6,$7) returning *",[characterId,userId,OUTFIT_MODEL,prompt,retryId===undefined?OUTFIT_CHANGE_COST:0,outfitKey,change.id]);
    await c.query("commit");
    return {character,change,row:created.rows[0]};
  }catch(e){await c.query("rollback");throw e;}finally{c.release();}
}

async function submitOutfit(reservation:Awaited<ReturnType<typeof reserveOutfit>>) {
  const {character,change}=reservation;
  let row=reservation.row;
  const userId=Number(row.user_id);
  let chargeId:string|null=null;
  let accepted=false;
  try {
    const refs=await resolveRefs(userId,character);
    const submit=async(id?:string)=>{
      if(id){chargeId=id;await sql`update character_idle_videos set charge_id=${id} where id=${row.id} and user_id=${userId}`;}
      return createVideo({model:OUTFIT_MODEL,prompt:row.prompt,seconds:OUTFIT_SECONDS,resolution:OUTFIT_RESOLUTION,aspect_ratio:"9:16",negative_prompt:IDLE_NEGATIVE_PROMPT,async:true,generate_audio:false,input_references:refs,extra_body:{watermark:false}});
    };
    const result=row.credits_spent>0 ? (await paidCall(userId,row.credits_spent,"video",OUTFIT_MODEL,submit)).result : await submit();
    const jobId=result.id??null;
    const sourceUrl=result.output_url??result.data?.[0]?.url??null;
    if(!jobId&&!sourceUrl)throw new SirayaApiError(502,"生成服務沒有回傳任務或影片");
    await sql`update character_idle_videos set job_id=${jobId},source_url=${sourceUrl},charge_id=${chargeId} where id=${row.id} and user_id=${userId}`;
    accepted=true;
    row={...row,job_id:jobId,source_url:sourceUrl,charge_id:chargeId?Number(chargeId):null};
    if(sourceUrl){
      const url=await persistGeneratedMedia(sourceUrl,{userId,kind:"video"});
      const completed=await sql<IdleVideoRow>`update character_idle_videos set status='completed',url=${url} where id=${row.id} and user_id=${userId} returning *`;
      row=completed.rows[0];
      await setActiveIdleVideo(character.id,userId,row.id);
    }
    return {change,video:row};
  }catch(e){
    if(!accepted){
      if(chargeId)await refundCharge(userId,chargeId);
      const failed=await sql<IdleVideoRow>`update character_idle_videos set status='failed',charge_id=${chargeId} where id=${row.id} and user_id=${userId} returning *`;
      if(failed.rows[0])await pollIdleVideoJob(failed.rows[0]);
    }
    throw e;
  }
}

export async function purchaseOutfitChange(userId:number,character:CharacterRow,outfitKey:string):Promise<{change:OutfitChangeRow;video:IdleVideoRow}> {
  if(!outfitByKey(outfitKey))throw new SirayaApiError(400,"找不到這套服裝");
  return submitOutfit(await reserveOutfit(userId,Number(character.id),outfitKey));
}
export async function retryOutfitChange(userId:number,character:CharacterRow,change:OutfitChangeRow):Promise<IdleVideoRow> {
  const result=await submitOutfit(await reserveOutfit(userId,Number(character.id),change.outfit_key,Number(change.id)));
  return result.video;
}
