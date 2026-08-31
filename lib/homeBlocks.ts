/**
 * Editable home-page content: hero slides, model showcase cards, canvas
 * templates. Rows in `home_blocks`, edited from /admin. Card images are
 * admin-uploaded assets, served publicly through /api/content/[id]/image.
 */
import { sql } from "./db";

export type Section = "hero" | "showcase" | "template";
export const SECTIONS: Section[] = ["hero", "showcase", "template"];

export interface HomeBlockRow {
  id: number;
  section: Section;
  sort: number;
  title: string;
  subtitle: string;
  badge: string | null;
  asset_id: number | null;
  target_mode: string | null;
  model_id: string | null;
  prompt: string | null;
  params: Record<string, unknown>;
  active: boolean;
}

export interface PublicBlock {
  id: number;
  section: Section;
  title: string;
  subtitle: string;
  badge: string | null;
  imageUrl: string | null;
  targetMode: string | null;
  modelId: string | null;
  prompt: string | null;
  params: Record<string, unknown>;
  hasImage: boolean;
}

export function toPublicBlock(b: HomeBlockRow): PublicBlock {
  return {
    id: b.id,
    section: b.section,
    title: b.title,
    subtitle: b.subtitle,
    badge: b.badge,
    imageUrl: b.asset_id ? `/api/content/${b.id}/image` : null,
    targetMode: b.target_mode,
    modelId: b.model_id,
    prompt: b.prompt,
    params: b.params ?? {},
    hasImage: !!b.asset_id,
  };
}

export async function listBlocks(includeInactive: boolean): Promise<HomeBlockRow[]> {
  const { rows } = includeInactive
    ? await sql<HomeBlockRow>`
        select id, section, sort, title, subtitle, badge, asset_id, target_mode, model_id, prompt, params, active
        from home_blocks order by section, sort, id`
    : await sql<HomeBlockRow>`
        select id, section, sort, title, subtitle, badge, asset_id, target_mode, model_id, prompt, params, active
        from home_blocks where active order by section, sort, id`;
  return rows;
}

export async function getBlock(id: number): Promise<HomeBlockRow | null> {
  const { rows } = await sql<HomeBlockRow>`
    select id, section, sort, title, subtitle, badge, asset_id, target_mode, model_id, prompt, params, active
    from home_blocks where id = ${id} limit 1`;
  return rows[0] ?? null;
}

export async function createBlock(section: Section): Promise<HomeBlockRow> {
  const { rows } = await sql<HomeBlockRow>`
    insert into home_blocks (section, sort)
    values (${section}, (select coalesce(max(sort), 0) + 1 from home_blocks where section = ${section}))
    returning id, section, sort, title, subtitle, badge, asset_id, target_mode, model_id, prompt, params, active`;
  return rows[0];
}

/** Full-row update — the admin editor always sends every field. */
export async function saveBlock(b: {
  id: number;
  sort: number;
  title: string;
  subtitle: string;
  badge: string | null;
  asset_id: number | null;
  target_mode: string | null;
  model_id: string | null;
  prompt: string | null;
  params: Record<string, unknown>;
  active: boolean;
}): Promise<void> {
  await sql`
    update home_blocks set
      sort = ${b.sort},
      title = ${b.title},
      subtitle = ${b.subtitle},
      badge = ${b.badge},
      asset_id = ${b.asset_id},
      target_mode = ${b.target_mode},
      model_id = ${b.model_id},
      prompt = ${b.prompt},
      params = ${JSON.stringify(b.params ?? {})}::jsonb,
      active = ${b.active},
      updated_at = now()
    where id = ${b.id}`;
}

export async function deleteBlock(id: number): Promise<void> {
  await sql`delete from home_blocks where id = ${id}`;
}
