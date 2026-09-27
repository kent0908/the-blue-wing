import { sql } from "./db";

/**
 * Cached companion speech. One audio file per assistant message, keyed by
 * message id: generating costs credits, replaying must not. The ownership
 * check lives in SQL (join through characters.user_id) rather than trusting
 * a caller-supplied character id, the same shape as the shadow-evaluation
 * claim in lib/companionDecisionShadow.ts.
 */

export interface MessageAudioRow {
  message_id: string;
  voice_name: string;
  pathname: string;
  seconds: number | null;
  credits: number;
}

/** The assistant message's text, but only if this user owns the character it belongs to. */
export async function ownedAssistantMessage(
  userId: number,
  characterId: number,
  messageId: number
): Promise<{ content: string; voice_name: string | null; personality: string; official_key: string | null; speech_language: string | null } | null> {
  const { rows } = await sql<{ content: string; voice_name: string | null; personality: string; official_key: string | null; speech_language: string | null }>`
    select m.content, c.voice_name, c.personality, c.official_key, m.speech_language
    from character_messages m
    join characters c on c.id = m.character_id
    where m.id = ${messageId}
      and m.character_id = ${characterId}
      and c.user_id = ${userId}
      and m.role = 'assistant'
    limit 1
  `;
  return rows[0] ?? null;
}

export async function getMessageAudio(userId: number, messageId: number): Promise<MessageAudioRow | null> {
  const { rows } = await sql<MessageAudioRow>`
    select message_id, voice_name, pathname, seconds, credits
    from character_message_audio
    where message_id = ${messageId} and user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

/** Which of these messages already have audio — lets the chat render its play buttons without one request per bubble. */
export async function listMessageAudio(userId: number, characterId: number): Promise<Record<string, string>> {
  const { rows } = await sql<{ message_id: string; pathname: string }>`
    select message_id, pathname from character_message_audio
    where user_id = ${userId} and character_id = ${characterId}
  `;
  return Object.fromEntries(rows.map((r) => [String(r.message_id), `/api/media/${r.pathname}`]));
}

export async function saveMessageAudio(input: {
  messageId: number;
  characterId: number;
  userId: number;
  voiceName: string;
  pathname: string;
  seconds: number | null;
  chars: number;
  credits: number;
}): Promise<void> {
  await sql`
    insert into character_message_audio (message_id, character_id, user_id, voice_name, pathname, seconds, chars, credits)
    values (${input.messageId}, ${input.characterId}, ${input.userId}, ${input.voiceName}, ${input.pathname}, ${input.seconds}, ${input.chars}, ${input.credits})
    on conflict (message_id) do nothing
  `;
}

export async function setCharacterVoice(userId: number, characterId: number, voiceName: string | null, language?: string): Promise<boolean> {
  const { rowCount } = await sql`
    update characters set voice_name = ${voiceName}, speech_language = coalesce(${language ?? null}, speech_language), updated_at = now() where id = ${characterId} and user_id = ${userId}
  `;
  return !!rowCount;
}
