import { put } from "@vercel/blob";
import { sql } from "./db";
import { createVideo, getVideoStatus, SirayaApiError } from "./siraya";
import { persistGeneratedMedia } from "./mediaStore";
import { assertPromptSafety } from "./promptSafety";
import { IDLE_NEGATIVE_PROMPT, IDLE_POSITIVE_TEMPLATE, IDLE_VIDEO_SECONDS } from "./characterIdleVideo";
import { createCharacter, getOfficialClone, type CharacterRow } from "./characters";
import { OFFICIAL_CHARACTER_SEEDS, contentRatingForAge, type ContentRating, type OfficialCharacterSeed } from "./companionOfficialSeed";
import { validateProfile, OFFICIAL_MIN_AGE } from "./characterProfile";
import { characterLevel } from "./characters";

/**
 * 官方陪聊角色 — templates in `official_characters` (seeded from
 * lib/companionOfficialSeed.ts by syncOfficialCharacters), plus the per-user
 * "adopt" step that turns a template into an ordinary `characters` row the
 * user owns (official_key set). That copy is what all the existing chat /
 * affection / memory / idle-video code operates on, so official characters
 * needed no parallel per-user state tables.
 *
 * The idle loop is generated once per template by an admin
 * (startOfficialIdleVideo — SIRAYA-Seedance-2.0-mini, 720p, 10s, the
 * front-view crop as the image reference) and stored under
 * generations/official/<key>/, which app/api/media serves to any signed-in
 * user. Adopting copies it in as the clone's active idle video; users can't
 * regenerate it (contentRules.idleRegen).
 */

export const OFFICIAL_IDLE_MODEL = "SIRAYA-Seedance-2.0-mini";
export const OFFICIAL_IDLE_RESOLUTION = "720p";

export interface OfficialCharacterRow {
  key: string;
  name: string;
  role_title: string;
  age: number;
  content_rating: ContentRating;
  sort: number;
  personality: string;
  likes: string;
  profile: unknown;
  avatar_path: string;
  idle_prompt: string;
  idle_video_url: string | null;
  idle_video_job_id: string | null;
  idle_video_status: "none" | "pending" | "completed" | "failed";
  idle_video_model: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

/** The idle-video prompt for a template: its appearance sentence + the fixed cinematography template (same one user characters get). */
export function buildOfficialIdlePrompt(seed: OfficialCharacterSeed): string {
  return `${seed.idleAppearance}\n\n${IDLE_POSITIVE_TEMPLATE} Preserve the exact identity, outfit and proportions of the supplied reference image. The first and last frame must align for a smooth seamless 10-second loop. No text, logos or visible watermarks.`;
}

/** Upserts every seed into the table (persona/profile/avatar/prompt); keeps existing idle-video state. */
export async function syncOfficialCharacters(): Promise<{ synced: number }> {
  for (const seed of OFFICIAL_CHARACTER_SEEDS) {
    const profile = validateProfile({ ...seed.profile, version: 1 }, OFFICIAL_MIN_AGE);
    await sql`
      insert into official_characters (key, name, role_title, age, content_rating, sort, personality, likes, profile, avatar_path, idle_prompt)
      values (${seed.key}, ${seed.name}, ${seed.roleTitle}, ${seed.age}, ${contentRatingForAge(seed.age)}, ${seed.sort}, ${seed.personality}, ${seed.likes}, ${JSON.stringify(profile)}::jsonb, ${seed.avatarPath}, ${buildOfficialIdlePrompt(seed)})
      on conflict (key) do update set
        name = excluded.name, role_title = excluded.role_title, age = excluded.age, content_rating = excluded.content_rating, sort = excluded.sort,
        personality = excluded.personality, likes = excluded.likes, profile = excluded.profile, avatar_path = excluded.avatar_path, idle_prompt = excluded.idle_prompt,
        updated_at = now()
    `;
  }
  return { synced: OFFICIAL_CHARACTER_SEEDS.length };
}

export async function listOfficialCharacters(includeUnpublished = false): Promise<OfficialCharacterRow[]> {
  const { rows } = await sql<OfficialCharacterRow>`
    select key, name, role_title, age, content_rating, sort, personality, likes, profile, avatar_path, idle_prompt, idle_video_url, idle_video_job_id, idle_video_status, idle_video_model, published, created_at, updated_at from official_characters where (${includeUnpublished} or published) order by sort asc, key asc
  `;
  return rows;
}

export async function getOfficialCharacter(key: string): Promise<OfficialCharacterRow | null> {
  const { rows } = await sql<OfficialCharacterRow>`select key, name, role_title, age, content_rating, sort, personality, likes, profile, avatar_path, idle_prompt, idle_video_url, idle_video_job_id, idle_video_status, idle_video_model, published, created_at, updated_at from official_characters where key = ${key} limit 1`;
  return rows[0] ?? null;
}

export interface PublicOfficialCharacter {
  key: string;
  name: string;
  roleTitle: string;
  age: number;
  contentRating: ContentRating;
  avatarSrc: string;
  personality: string;
  greeting: string;
  idleVideoUrl: string | null;
  idleVideoStatus: OfficialCharacterRow["idle_video_status"];
  /** the caller's own copy, when they've opened this character before */
  adopted: { id: number; affection: number; levelName: string; updatedAt: string } | null;
}

export function toPublicOfficial(row: OfficialCharacterRow, clone: CharacterRow | null): PublicOfficialCharacter {
  const profile = (row.profile ?? {}) as { greeting?: string };
  return {
    key: row.key,
    name: row.name,
    roleTitle: row.role_title,
    age: row.age,
    contentRating: row.content_rating,
    avatarSrc: row.avatar_path,
    personality: row.personality,
    greeting: profile.greeting ?? "",
    idleVideoUrl: row.idle_video_url,
    idleVideoStatus: row.idle_video_status,
    adopted: clone ? { id: Number(clone.id), affection: clone.affection, levelName: characterLevel(clone).name, updatedAt: clone.updated_at } : null,
  };
}

/**
 * Gives `userId` their own copy of the template: the front-view image goes
 * into their 資產庫 (so every existing avatar code path — ownership checks,
 * reference resolution — just works), the persona is copied verbatim, and
 * the official idle loop is inserted as the clone's active idle video.
 * Idempotent: a second call returns the existing copy.
 */
export async function adoptOfficialCharacter(userId: number, key: string, origin: string): Promise<{ character: CharacterRow; created: boolean }> {
  const existing = await getOfficialClone(userId, key);
  if (existing) return { character: existing, created: false };
  const tpl = await getOfficialCharacter(key);
  if (!tpl || !tpl.published) throw new SirayaApiError(404, "找不到這個官方角色", "invalid_request_error", "not_found");

  // avatar → the user's own asset
  let avatarAssetId: number | null = null;
  try {
    const res = await fetch(new URL(tpl.avatar_path, origin).toString());
    if (!res.ok) throw new Error(`avatar fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const filename = `官方-${tpl.name}.jpg`;
    const blob = await put(`assets/${userId}/official-${key}-${Date.now()}.jpg`, buf, { access: "private", contentType, addRandomSuffix: true });
    const { rows } = await sql<{ id: number }>`
      insert into assets (user_id, url, pathname, content_type, size, filename)
      values (${userId}, ${blob.url}, ${blob.pathname}, ${contentType}, ${buf.length}, ${filename}) returning id
    `;
    avatarAssetId = Number(rows[0].id);
  } catch (err) {
    console.error("official adopt: avatar copy failed", err);
    // the character still works for chat; the idle loop below doesn't depend on the asset
  }

  const character = await createCharacter(userId, {
    name: tpl.name,
    avatarAssetId,
    personality: tpl.personality,
    likes: tpl.likes,
    profile: validateProfile(tpl.profile, OFFICIAL_MIN_AGE),
    officialKey: key,
    contentRating: tpl.content_rating,
  });

  if (tpl.idle_video_url && tpl.idle_video_status === "completed") {
    await sql`
      insert into character_idle_videos (character_id, user_id, status, model, prompt, url, free, credits_spent, is_active)
      values (${character.id}, ${userId}, 'completed', ${tpl.idle_video_model ?? OFFICIAL_IDLE_MODEL}, ${tpl.idle_prompt}, ${tpl.idle_video_url}, true, 0, true)
    `;
  }
  return { character, created: true };
}

/* ---- admin: the one-time official idle loop ---------------------------- */

/**
 * Submits the template's idle-video job to SIRAYA (async) — Seedance 2.0 mini
 * at 720p for 10s, 9:16, with the front-view crop (a public URL SIRAYA can
 * fetch) as the image reference. No credits involved: this is the
 * platform's own asset, not a user generation. The prompt still goes
 * through the safety gate like everything else.
 */
export async function startOfficialIdleVideo(key: string, origin: string): Promise<OfficialCharacterRow> {
  const tpl = await getOfficialCharacter(key);
  if (!tpl) throw new SirayaApiError(404, "找不到這個官方角色", "invalid_request_error", "not_found");
  const seed = OFFICIAL_CHARACTER_SEEDS.find((s) => s.key === key);
  const prompt = seed ? buildOfficialIdlePrompt(seed) : tpl.idle_prompt;
  assertPromptSafety(prompt);
  const referenceUrl = new URL(tpl.avatar_path, origin).toString();
  const json = await createVideo({
    model: OFFICIAL_IDLE_MODEL,
    prompt,
    seconds: IDLE_VIDEO_SECONDS,
    resolution: OFFICIAL_IDLE_RESOLUTION,
    aspect_ratio: "9:16",
    negative_prompt: IDLE_NEGATIVE_PROMPT,
    generate_audio: false,
    async: true,
    input_references: [{ type: "image", url: referenceUrl }],
    extra_body: { watermark: false },
  });
  const jobId: string | undefined = json?.id ?? json?.job_id ?? json?.data?.id;
  const immediateUrl: string | undefined = json?.output_url ?? json?.data?.[0]?.url;
  if (!jobId && !immediateUrl) throw new SirayaApiError(502, "影片服務沒有回傳工作編號", "api_error", "no_job");
  const { rows } = await sql<OfficialCharacterRow>`
    update official_characters set idle_video_job_id = ${jobId ?? null}, idle_video_status = 'pending', idle_video_model = ${OFFICIAL_IDLE_MODEL}, idle_prompt = ${prompt}, idle_video_url = ${immediateUrl ?? null}, updated_at = now()
    where key = ${key} returning key, name, role_title, age, content_rating, sort, personality, likes, profile, avatar_path, idle_prompt, idle_video_url, idle_video_job_id, idle_video_status, idle_video_model, published, created_at, updated_at
  `;
  return immediateUrl ? pollOfficialIdleVideo(key) : rows[0];
}

/** Polls the pending job; on completion re-hosts the clip under generations/official/<key>/ and marks the template completed. */
export async function pollOfficialIdleVideo(key: string): Promise<OfficialCharacterRow> {
  const tpl = await getOfficialCharacter(key);
  if (!tpl) throw new SirayaApiError(404, "找不到這個官方角色", "invalid_request_error", "not_found");
  if (tpl.idle_video_status !== "pending") return tpl;
  let rawUrl: string | null = tpl.idle_video_url && !tpl.idle_video_url.startsWith("/api/media/") ? tpl.idle_video_url : null;
  let status = rawUrl ? "completed" : "processing";
  if (!rawUrl && tpl.idle_video_job_id) {
    const json = await getVideoStatus(tpl.idle_video_job_id);
    rawUrl = json?.output_url ?? json?.data?.[0]?.url ?? null;
    status = json?.status ?? (rawUrl ? "completed" : "processing");
  }
  if (status === "completed" && rawUrl) {
    const url = await persistGeneratedMedia(rawUrl, { userId: 0, kind: "video", pathPrefix: `official/${key}` });
    const { rows } = await sql<OfficialCharacterRow>`
      update official_characters set idle_video_status = 'completed', idle_video_url = ${url}, updated_at = now() where key = ${key} returning key, name, role_title, age, content_rating, sort, personality, likes, profile, avatar_path, idle_prompt, idle_video_url, idle_video_job_id, idle_video_status, idle_video_model, published, created_at, updated_at
    `;
    // existing clones get the new loop as their active video (older official loops stay in their history, deactivated)
    await sql`update character_idle_videos set is_active = false where character_id in (select id from characters where official_key = ${key})`;
    await sql`
      insert into character_idle_videos (character_id, user_id, status, model, prompt, url, free, credits_spent, is_active)
      select id, user_id, 'completed', ${OFFICIAL_IDLE_MODEL}, ${tpl.idle_prompt}, ${url}, true, 0, true from characters where official_key = ${key}
    `;
    return rows[0];
  }
  if (status === "failed") {
    const { rows } = await sql<OfficialCharacterRow>`update official_characters set idle_video_status = 'failed', updated_at = now() where key = ${key} returning key, name, role_title, age, content_rating, sort, personality, likes, profile, avatar_path, idle_prompt, idle_video_url, idle_video_job_id, idle_video_status, idle_video_model, published, created_at, updated_at`;
    return rows[0];
  }
  return tpl;
}
