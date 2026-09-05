/**
 * 陪聊角色 IP — a character built from an asset-library image plus a name and
 * personality, kept as its own persistent chat thread (character_messages).
 * Separate from 生成紀錄 (lib/generations.ts): that's one-off results, this is
 * an ongoing conversation with a character the user built.
 *
 * Two engagement mechanics on top of plain chat (matches yollo.ai-style
 * companion apps):
 *  - 好感度 (affection): +1 per message, +5 when the message touches one of
 *    the character's declared 喜好 (likes). Crossing a threshold in
 *    AFFECTION_LEVELS changes the relationship stage baked into the system
 *    prompt — the "unlock more intimate scenes" loop the product asked for,
 *    done as a tone/content shift rather than a gated media gallery (no
 *    scene-authoring UI exists yet — see buildSystemPrompt).
 *  - memory_summary: a rolling long-term-memory digest, refreshed every
 *    MEMORY_REFRESH_EVERY turns by asking the model to compress what matters
 *    from recent messages into a few bullet points. Every reply carries this
 *    summary PLUS the last HISTORY_TURNS raw messages (see the messages
 *    route), so the character remembers things far outside that sliding
 *    window without the prompt growing unbounded as the conversation gets
 *    long.
 */
import { sql } from "./db";
import type { AssetRow } from "./assets";

export const DEFAULT_CHARACTER_MODEL = "deepseek-v4-flash-0731";

/** How many user turns between long-term-memory summary refreshes. */
export const MEMORY_REFRESH_EVERY = 10;

export interface CharacterRow {
  id: number;
  user_id: number;
  name: string;
  avatar_asset_id: number | null;
  personality: string;
  likes: string;
  model: string;
  affection: number;
  turn_count: number;
  memory_summary: string;
  created_at: string;
  updated_at: string;
}

/* ---- 好感度階段 ---- */

export interface AffectionLevel {
  min: number;
  name: string;
  unlock: string;
}

export const AFFECTION_LEVELS: AffectionLevel[] = [
  { min: 0, name: "初次見面", unlock: "剛認識，還在互相熟悉" },
  { min: 30, name: "漸漸熟悉", unlock: "會記得你們聊過的話題，主動提起" },
  { min: 80, name: "好朋友", unlock: "會用暱稱稱呼你，語氣更放鬆自然" },
  { min: 160, name: "特別的人", unlock: "會主動分享心事，對話更親密貼心" },
  { min: 280, name: "心動時刻", unlock: "專屬於你們的對話氛圍，最真實的一面" },
];

export interface LevelInfo {
  index: number;
  name: string;
  unlock: string;
  min: number;
  nextMin: number | null;
  /** 0-100 progress toward nextMin; 100 when already at the top level */
  progressPct: number;
}

export function levelInfo(affection: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < AFFECTION_LEVELS.length; i++) {
    if (affection >= AFFECTION_LEVELS[i].min) idx = i;
  }
  const cur = AFFECTION_LEVELS[idx];
  const next = AFFECTION_LEVELS[idx + 1] ?? null;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((affection - cur.min) / (next.min - cur.min)) * 100)))
    : 100;
  return { index: idx, name: cur.name, unlock: cur.unlock, min: cur.min, nextMin: next?.min ?? null, progressPct };
}

/** Very deliberately simple: substring match against the character's own
 *  comma/pause-mark separated 喜好 tags — no extra model call needed to
 *  decide whether a message "counts" as talking about something they like. */
export function matchesLikes(content: string, likes: string): boolean {
  const tags = likes
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tags.length) return false;
  const lower = content.toLowerCase();
  return tags.some((t) => lower.includes(t.toLowerCase()));
}

export interface PublicCharacter {
  id: number;
  name: string;
  /** null when the source asset was deleted, or the character has none */
  avatarSrc: string | null;
  personality: string;
  likes: string;
  model: string;
  affection: number;
  level: LevelInfo;
  createdAt: string;
  updatedAt: string;
}

export function toPublicCharacter(c: CharacterRow): PublicCharacter {
  return {
    id: c.id,
    name: c.name,
    avatarSrc: c.avatar_asset_id ? `/api/assets/${c.avatar_asset_id}/raw` : null,
    personality: c.personality,
    likes: c.likes,
    model: c.model,
    affection: c.affection,
    level: levelInfo(c.affection),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export async function listCharacters(userId: number): Promise<CharacterRow[]> {
  const { rows } = await sql<CharacterRow>`
    select id, user_id, name, avatar_asset_id, personality, likes, model, affection, turn_count, memory_summary, created_at, updated_at
    from characters where user_id = ${userId}
    order by updated_at desc
  `;
  return rows;
}

export async function getCharacter(userId: number, id: number): Promise<CharacterRow | null> {
  const { rows } = await sql<CharacterRow>`
    select id, user_id, name, avatar_asset_id, personality, likes, model, affection, turn_count, memory_summary, created_at, updated_at
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
  input: { name: string; avatarAssetId: number | null; personality: string; likes: string }
): Promise<CharacterRow> {
  const { rows } = await sql<CharacterRow>`
    insert into characters (user_id, name, avatar_asset_id, personality, likes, model)
    values (${userId}, ${input.name}, ${input.avatarAssetId}, ${input.personality}, ${input.likes}, ${DEFAULT_CHARACTER_MODEL})
    returning id, user_id, name, avatar_asset_id, personality, likes, model, affection, turn_count, memory_summary, created_at, updated_at
  `;
  return rows[0];
}

export async function updateCharacter(
  userId: number,
  id: number,
  patch: { name?: string; avatarAssetId?: number | null; personality?: string; likes?: string }
): Promise<CharacterRow | null> {
  const current = await getCharacter(userId, id);
  if (!current) return null;
  const name = patch.name ?? current.name;
  const avatarAssetId = patch.avatarAssetId !== undefined ? patch.avatarAssetId : current.avatar_asset_id;
  const personality = patch.personality ?? current.personality;
  const likes = patch.likes ?? current.likes;
  const { rows } = await sql<CharacterRow>`
    update characters
    set name = ${name}, avatar_asset_id = ${avatarAssetId}, personality = ${personality}, likes = ${likes}, updated_at = now()
    where id = ${id} and user_id = ${userId}
    returning id, user_id, name, avatar_asset_id, personality, likes, model, affection, turn_count, memory_summary, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function deleteCharacter(userId: number, id: number): Promise<boolean> {
  const { rowCount } = await sql`delete from characters where id = ${id} and user_id = ${userId}`;
  return (rowCount ?? 0) > 0;
}

/** +1 per message, +extra for touching a 喜好 topic; bumps turn_count and
 *  updated_at (so the list sorts by "last chatted with") in the same write. */
export async function recordTurn(id: number, gain: number): Promise<{ affection: number; turnCount: number }> {
  const { rows } = await sql<{ affection: number; turn_count: number }>`
    update characters
    set affection = affection + ${gain}, turn_count = turn_count + 1, updated_at = now()
    where id = ${id}
    returning affection, turn_count
  `;
  return { affection: rows[0].affection, turnCount: rows[0].turn_count };
}

export async function updateMemorySummary(id: number, summary: string): Promise<void> {
  await sql`update characters set memory_summary = ${summary} where id = ${id}`;
}

/* ---- chat history ---- */

export interface CharacterMessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/** Most recent `limit` messages, oldest-first (so callers can feed the array
 *  straight into a chat completion). Ordering matters here: this is used both
 *  as the sliding "recent context" window per turn and as the input to the
 *  long-term-memory refresh — taking the oldest N instead would freeze both
 *  on the conversation's opening messages forever once it grows past `limit`. */
export async function listMessages(characterId: number, limit = 200): Promise<CharacterMessageRow[]> {
  const { rows } = await sql<CharacterMessageRow>`
    select id, role, content, created_at
    from character_messages
    where character_id = ${characterId}
    order by created_at desc
    limit ${limit}
  `;
  return rows.reverse();
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

/** System prompt binding the character's persona, relationship stage, long-term
 *  memory, and the user's own identity together for one chat turn. */
export function buildSystemPrompt(character: CharacterRow, persona: UserPersona): string {
  const level = levelInfo(character.affection);
  const lines = [
    `你是「${character.name}」，請完全代入這個角色跟使用者互動。`,
    character.personality.trim()
      ? `角色設定：\n${character.personality.trim()}`
      : "角色設定：（沒有特別設定，請自然扮演一個友善、有個性的角色）",
  ];
  if (character.likes.trim()) {
    lines.push(`你平常喜歡：${character.likes.trim()}。使用者聊到這些話題時，請表現得特別開心、投入。`);
  }
  lines.push(
    `你們目前的關係階段是「${level.name}」：${level.unlock}。請讓語氣和親密程度符合這個階段——不要突然變得比階段允許的更親密，也不要表現得比階段應有的還生疏。`
  );
  if (character.memory_summary.trim()) {
    lines.push(`關於你們過去對話的長期記憶（就算沒有在最近幾句提到，也請自然地記得）：\n${character.memory_summary.trim()}`);
  }
  if (persona.name.trim() || persona.bio.trim()) {
    lines.push(
      `跟你聊天的使用者設定了自己的身分：${persona.name.trim() ? `名字是「${persona.name.trim()}」。` : ""}${persona.bio.trim()}`
    );
  }
  lines.push("請一律使用繁體中文自然對話，不要提到你是語言模型或 AI，也不要跳出角色。");
  return lines.join("\n\n");
}

/** Prompt for the periodic long-term-memory refresh — a separate, plain
 *  (non-roleplay) instruction so the summarizing call doesn't itself get
 *  swept into staying in character. */
export function buildMemoryUpdatePrompt(character: CharacterRow, recentMessages: CharacterMessageRow[]): string {
  const convo = recentMessages.map((m) => `${m.role === "user" ? "使用者" : character.name}：${m.content}`).join("\n");
  return [
    `你是記憶整理助手，負責幫角色「${character.name}」整理跟使用者之間值得長期記住的資訊。`,
    character.memory_summary.trim() ? `目前的長期記憶摘要：\n${character.memory_summary.trim()}` : "目前還沒有長期記憶。",
    `最近的對話：\n${convo}`,
    "請輸出更新後的長期記憶摘要：條列重要事實、使用者偏好、關係進展、聊過的話題，最多 8 條、每條不超過 30 字、繁體中文。只輸出條列內容本身，不要加其他說明。",
  ].join("\n\n");
}
