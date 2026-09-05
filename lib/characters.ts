/**
 * 陪聊角色 IP — a character built from an asset-library image plus a name and
 * personality, kept as its own persistent chat thread (character_messages).
 * Separate from 生成紀錄 (lib/generations.ts): that's one-off results, this is
 * an ongoing conversation with a character the user built.
 */
import { sql } from "./db";
import type { AssetRow } from "./assets";

export const DEFAULT_CHARACTER_MODEL = "deepseek-v4-flash-0731";

export interface CharacterRow {
  id: number;
  user_id: number;
  name: string;
  avatar_asset_id: number | null;
  personality: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface PublicCharacter {
  id: number;
  name: string;
  /** null when the source asset was deleted, or the character has none */
  avatarSrc: string | null;
  personality: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export function toPublicCharacter(c: CharacterRow): PublicCharacter {
  return {
    id: c.id,
    name: c.name,
    avatarSrc: c.avatar_asset_id ? `/api/assets/${c.avatar_asset_id}/raw` : null,
    personality: c.personality,
    model: c.model,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export async function listCharacters(userId: number): Promise<CharacterRow[]> {
  const { rows } = await sql<CharacterRow>`
    select id, user_id, name, avatar_asset_id, personality, model, created_at, updated_at
    from characters where user_id = ${userId}
    order by updated_at desc
  `;
  return rows;
}

export async function getCharacter(userId: number, id: number): Promise<CharacterRow | null> {
  const { rows } = await sql<CharacterRow>`
    select id, user_id, name, avatar_asset_id, personality, model, created_at, updated_at
    from characters where id = ${id} and user_id = ${userId}
  `;
  return rows[0] ?? null;
}

/** Verifies the asset belongs to the same user before binding it as an avatar. */
export async function ownedAssetId(userId: number, assetId: number | null | undefined): Promise<number | null> {
  if (!assetId) return null;
  const { rows } = await sql<AssetRow>`select id from assets where id = ${assetId} and user_id = ${userId}`;
  return rows[0] ? assetId : null;
}

export async function createCharacter(
  userId: number,
  input: { name: string; avatarAssetId: number | null; personality: string }
): Promise<CharacterRow> {
  const { rows } = await sql<CharacterRow>`
    insert into characters (user_id, name, avatar_asset_id, personality, model)
    values (${userId}, ${input.name}, ${input.avatarAssetId}, ${input.personality}, ${DEFAULT_CHARACTER_MODEL})
    returning id, user_id, name, avatar_asset_id, personality, model, created_at, updated_at
  `;
  return rows[0];
}

export async function updateCharacter(
  userId: number,
  id: number,
  patch: { name?: string; avatarAssetId?: number | null; personality?: string }
): Promise<CharacterRow | null> {
  const current = await getCharacter(userId, id);
  if (!current) return null;
  const name = patch.name ?? current.name;
  const avatarAssetId = patch.avatarAssetId !== undefined ? patch.avatarAssetId : current.avatar_asset_id;
  const personality = patch.personality ?? current.personality;
  const { rows } = await sql<CharacterRow>`
    update characters
    set name = ${name}, avatar_asset_id = ${avatarAssetId}, personality = ${personality}, updated_at = now()
    where id = ${id} and user_id = ${userId}
    returning id, user_id, name, avatar_asset_id, personality, model, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function deleteCharacter(userId: number, id: number): Promise<boolean> {
  const { rowCount } = await sql`delete from characters where id = ${id} and user_id = ${userId}`;
  return (rowCount ?? 0) > 0;
}

/** Bumps updated_at so the character list sorts by "last chatted with". */
export async function touchCharacter(id: number): Promise<void> {
  await sql`update characters set updated_at = now() where id = ${id}`;
}

/* ---- chat history ---- */

export interface CharacterMessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function listMessages(characterId: number, limit = 200): Promise<CharacterMessageRow[]> {
  const { rows } = await sql<CharacterMessageRow>`
    select id, role, content, created_at
    from character_messages
    where character_id = ${characterId}
    order by created_at asc
    limit ${limit}
  `;
  return rows;
}

export async function addMessage(
  characterId: number,
  role: "user" | "assistant",
  content: string
): Promise<CharacterMessageRow> {
  const { rows } = await sql<CharacterMessageRow>`
    insert into character_messages (character_id, role, content)
    values (${characterId}, ${role}, ${content})
    returning id, role, content, created_at
  `;
  return rows[0];
}

/* ---- the user's own persona for roleplay (one shared row per user) ---- */

export interface UserPersona {
  name: string;
  bio: string;
}

export async function getPersona(userId: number): Promise<UserPersona> {
  const { rows } = await sql<UserPersona>`select name, bio from user_personas where user_id = ${userId}`;
  return rows[0] ?? { name: "", bio: "" };
}

export async function savePersona(userId: number, persona: UserPersona): Promise<UserPersona> {
  const { rows } = await sql<UserPersona>`
    insert into user_personas (user_id, name, bio)
    values (${userId}, ${persona.name}, ${persona.bio})
    on conflict (user_id) do update set name = excluded.name, bio = excluded.bio, updated_at = now()
    returning name, bio
  `;
  return rows[0];
}

/** System prompt binding the character's persona to the user's own identity. */
export function buildSystemPrompt(character: CharacterRow, persona: UserPersona): string {
  const lines = [
    `你正在扮演一個名叫「${character.name}」的角色，請完全代入這個角色跟使用者互動。`,
    character.personality.trim()
      ? `角色設定：\n${character.personality.trim()}`
      : "角色設定：（沒有特別設定，請自然扮演一個友善、有個性的角色）",
  ];
  if (persona.name.trim() || persona.bio.trim()) {
    lines.push(
      `跟你聊天的使用者設定了自己的身分：${persona.name.trim() ? `名字是「${persona.name.trim()}」。` : ""}${persona.bio.trim()}`
    );
  }
  lines.push("請一律使用繁體中文自然對話，語氣符合角色設定，不要提到你是語言模型或 AI，也不要跳出角色。");
  return lines.join("\n\n");
}
