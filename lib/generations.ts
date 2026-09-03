/**
 * Persisted "生成紀錄" (generation history) — one row per successful image,
 * video, or text generation. Previously this only lived in React state on
 * /studio and vanished on reload; now every route that produces a result
 * calls recordGeneration() so it survives across sessions and devices.
 */
import { sql } from "./db";

export type GenerationKind = "image" | "video" | "text";

export interface GenerationRow {
  id: number;
  kind: GenerationKind;
  model: string;
  prompt: string;
  url: string | null;
  text_content: string | null;
  created_at: string;
}

export interface NewGeneration {
  kind: GenerationKind;
  model: string;
  prompt: string;
  url?: string | null;
  text?: string | null;
  /** video job id — dedupes repeated poll-driven writes for the same job */
  ref?: string | null;
}

/** Never throws — a logging failure should never fail the user's generation. */
export async function recordGeneration(userId: number, g: NewGeneration): Promise<void> {
  try {
    await sql`
      insert into generations (user_id, kind, model, prompt, url, text_content, ref)
      values (${userId}, ${g.kind}, ${g.model}, ${g.prompt}, ${g.url ?? null}, ${g.text ?? null}, ${g.ref ?? null})
      on conflict (user_id, ref) where ref is not null do nothing
    `;
  } catch (err) {
    console.error("recordGeneration failed:", err);
  }
}

export async function listGenerations(userId: number, limit = 60): Promise<GenerationRow[]> {
  const { rows } = await sql<GenerationRow>`
    select id, kind, model, prompt, url, text_content, created_at
    from generations
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `;
  return rows;
}
