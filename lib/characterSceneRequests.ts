import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { type CharacterSceneRow, type CharacterRow } from "./characters";
import type { SceneQuoteSpec } from "./characterSceneQuote";


export interface SceneRequest {
  id: string;
  character_id: number;
  user_id: number;
  kind: "image" | "video";
  level_index: number;
  avatar_asset_id: number;
  model: string;
  prompt: string;
  status: "quoted" | "submitting" | "processing" | "completed" | "failed";
  job_id: string | null;
  output_url: string | null;
  scene_id: number | null;
  credits_spent: number;
  credits_quoted: number;
  seconds: number | null;
  resolution: string | null;
  summary: string | null;
  expires_at: string | null;
  error_message: string | null;
  created_at: string;
}

export function parseCharacterId(id: string): number | null {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

export function isSceneRequestId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function getSceneRequest(userId: number, characterId: number, id: string): Promise<SceneRequest | null> {
  const { rows } = await sql<SceneRequest>`select * from character_scene_requests
    where id = ${id} and user_id = ${userId} and character_id = ${characterId}`;
  return rows[0] ?? null;
}

export async function pendingSceneRequests(userId: number, characterId: number): Promise<SceneRequest[]> {
  const { rows } = await sql<SceneRequest>`select * from character_scene_requests
    where user_id = ${userId} and character_id = ${characterId}
    and status in ('submitting','processing') order by created_at desc`;
  return rows;
}

export async function createSceneQuote(userId: number, character: CharacterRow, spec: SceneQuoteSpec): Promise<SceneRequest> {
  const { rows } = await sql<SceneRequest>`insert into character_scene_requests
    (id,user_id,character_id,kind,level_index,avatar_asset_id,model,prompt,status,credits_quoted,seconds,resolution,summary,expires_at)
    values (${randomUUID()},${userId},${character.id},${spec.kind},${spec.levelIndex},${spec.avatarAssetId},${spec.model},${spec.prompt},'quoted',${spec.credits},${spec.seconds},${spec.resolution},${spec.summary},now()+interval '10 minutes') returning *`;
  return rows[0];
}

/** Owned-character lock and quote lock serialize confirmation and keep repeat
 * confirmations idempotent before any paid provider I/O. */
export async function claimSceneQuote(userId: number, characterId: number, quoteId: string): Promise<{request: SceneRequest; created: boolean} | null> {
  const c = await sql.connect();
  try {
    await c.query("begin");
    const owner = await c.query("select id from characters where id=$1 and user_id=$2 for update", [characterId,userId]);
    if (!owner.rows.length) { await c.query("rollback"); return null; }
    const quote = await c.query<SceneRequest>("select * from character_scene_requests where id=$1 and user_id=$2 and character_id=$3 for update", [quoteId,userId,characterId]);
    const request = quote.rows[0];
    if (!request) { await c.query("rollback"); return null; }
    if (request.status !== "quoted") { await c.query("commit"); return {request,created:false}; }
    const active = await c.query<SceneRequest>("select * from character_scene_requests where user_id=$1 and character_id=$2 and kind=$3 and status in ('submitting','processing') limit 1", [userId,characterId,request.kind]);
    if (active.rows.length) { await c.query("rollback"); return null; }
    const claimed = await c.query<SceneRequest>("update character_scene_requests set status='submitting',updated_at=now() where id=$1 and expires_at>now() returning *", [quoteId]);
    await c.query("commit");
    return claimed.rows[0] ? {request:claimed.rows[0],created:true} : null;
  } catch (error) { await c.query("rollback"); throw error; } finally { c.release(); }
}

export async function setSceneRequestResult(request: SceneRequest, data: { jobId?: string; url?: string; creditsSpent: number }) {
  await sql`update character_scene_requests set job_id = ${data.jobId ?? null},
    output_url = ${data.url ?? null}, credits_spent = ${data.creditsSpent},
    status = 'processing', updated_at = now()
    where id = ${request.id} and user_id = ${request.user_id} and character_id = ${request.character_id}`;
}

export async function failSceneRequest(request: SceneRequest, message: string) {
  await sql`update character_scene_requests set status = 'failed', error_message = ${message}, updated_at = now()
    where id = ${request.id} and user_id = ${request.user_id} and status <> 'completed'`;
}

/** Only called with a server-observed provider result. Row lock makes repeat
 * polls idempotent, including two tabs completing the same job concurrently. */
export async function completeSceneRequest(request: SceneRequest, url: string): Promise<CharacterSceneRow> {
  const client = await sql.connect();
  try {
    await client.query("begin");
    const locked = await client.query<SceneRequest>(
      "select * from character_scene_requests where id=$1 and user_id=$2 and character_id=$3 for update",
      [request.id, request.user_id, request.character_id],
    );
    const current = locked.rows[0];
    if (!current || current.status === "failed") throw new Error("Scene request unavailable");
    let scene: CharacterSceneRow;
    if (current.scene_id) {
      const result = await client.query<CharacterSceneRow>("select * from character_scenes where id=$1 and user_id=$2 and character_id=$3", [current.scene_id, request.user_id, request.character_id]);
      scene = result.rows[0];
      if (!scene) throw new Error("Scene unavailable");
    } else {
      const result = await client.query<CharacterSceneRow>(
        "insert into character_scenes(character_id,user_id,kind,level_index,url,prompt,model) values($1,$2,$3,$4,$5,$6,$7) returning *",
        [current.character_id,current.user_id,current.kind,current.level_index,url,current.prompt,current.model],
      );
      scene = result.rows[0];
      await client.query("update character_scene_requests set scene_id=$1,output_url=$2,status='completed',updated_at=now() where id=$3", [scene.id,url,current.id]);
    }
    await client.query("commit");
    return scene;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
