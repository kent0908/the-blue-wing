/**
 * Model display name / sort order — a thin admin-editable layer on top of
 * the raw SIRAYA model id. Two independent concerns:
 *
 *   1. A sensible DEFAULT with zero configuration: strip router/vendor
 *      prefixes that are just upstream plumbing (SIRAYA-, ByteDance-,
 *      Dola-) — deliberately NOT "NSFW-", see the comment on cleanModelName
 *      — and group same-family models (Seedance, Seedream, Gemini, ...)
 *      together instead of whatever order SIRAYA's /v1/models happens to
 *      return them in.
 *   2. An admin override (model_display table) for either field, for the
 *      cases the computed default doesn't get right — see /admin/models.
 *
 * Server-only: every DB-touching export here is called from route handlers.
 */
import { sql } from "./db";

/**
 * Strips upstream vendor/router prefixes that are just plumbing, not
 * something a user needs to see — SIRAYA- (the router itself), ByteDance-
 * and Dola- (the underlying model vendor for the Seedream/Seedance family).
 *
 * Deliberately does NOT touch an "NSFW-" prefix. Two differently-moderated
 * models rendering with the identical label (or the safe one gone entirely)
 * would mean a real subscriber picking "Seedance 2.5" has no way to know
 * they'd actually get the unmoderated one — see lib/imageModels.ts's
 * displayModelName, which this supersedes for video/uncatalogued models.
 */
export function cleanModelName(id: string): string {
  // Some ids put NSFW- first and the vendor prefix after it
  // (NSFW-Dola-Seedream-5.0-pro) — strip NSFW- off, clean the rest, then put
  // it back, rather than anchoring the vendor-prefix regex to the very start
  // of the string (which would miss exactly this case).
  const nsfw = id.match(/^NSFW-(.+)$/i);
  const rest = (nsfw ? nsfw[1] : id).replace(/^(SIRAYA|ByteDance|Dola)-/i, "");
  return nsfw ? `NSFW-${rest}` : rest;
}

interface SortKey {
  family: string;
  familyRank: number;
  version: number;
  tier: number;
  base: string;
  isNsfw: boolean;
}

/**
 * Which family leads its modality's list. Seedream (image) and Seedance
 * (video) are the house families and always come first; they never compete
 * with each other since no list mixes modalities. Everything unlisted falls
 * to the end and stays alphabetical among itself.
 */
const FAMILY_RANK: Record<string, number> = {
  seedream: 0,
  seedance: 0,
  gemini: 1,
  veo: 1,
  gpt: 2,
  wan: 3,
  happyhorse: 4,
};

/**
 * Flagship-first ordering for the variant suffix within one version:
 * pro < (plain) < fast < lite < mini. "-pro-fast" scores between pro and
 * plain so 1.0-pro still leads 1.0-pro-fast.
 */
function tierOf(rest: string): number {
  let score = /(^|-)pro(-|$)/.test(rest) ? 0 : 1;
  if (/(^|-)fast(-|$)/.test(rest)) score += 0.5;
  if (/(^|-)lite(-|$)/.test(rest)) score += 1.5;
  if (/(^|-)mini(-|$)/.test(rest)) score += 2;
  return score;
}

function sortKeyOf(id: string): SortKey {
  const cleaned = cleanModelName(id);
  const isNsfw = /^NSFW-/i.test(cleaned);
  const base = cleaned.replace(/^NSFW-/i, "").toLowerCase();
  const family = base.match(/^[a-z]+/)?.[0] ?? base;
  const versionMatch = base.match(/(\d+(?:\.\d+)?)/);
  const version = versionMatch ? parseFloat(versionMatch[1]) : -1;
  const rest = versionMatch ? base.slice(base.indexOf(versionMatch[1]) + versionMatch[1].length) : "";
  return {
    family,
    familyRank: FAMILY_RANK[family] ?? 9,
    version,
    tier: tierOf(rest),
    base,
    isNsfw,
  };
}

/**
 * Default ordering with no admin input at all: every plain (non-NSFW) model
 * first, then every NSFW model as its own block at the very end. Keeping the
 * NSFW block entirely separate (rather than interleaved right after each
 * plain counterpart) is deliberate: a normal-use picker shouldn't have an
 * NSFW entry show up in the middle of the list you actually scroll through.
 *
 * Within each block: house family first (FAMILY_RANK — Seedream leads the
 * image list, Seedance the video one), then NEWEST VERSION FIRST, then
 * flagship variant first (tierOf). Version-descending is the 2026-09-08
 * change — it used to sort ascending, which buried the newest release
 * (Seedance 2.5, Seedream 5.0) at the bottom of its own family while
 * alphabetically-first families like happyhorse sat above Seedance entirely.
 * An admin-set sort_order still overrides all of this (see sortByDisplay).
 */
export function compareModelsDefault(idA: string, idB: string): number {
  const a = sortKeyOf(idA);
  const b = sortKeyOf(idB);
  return (
    Number(a.isNsfw) - Number(b.isNsfw) ||
    a.familyRank - b.familyRank ||
    a.family.localeCompare(b.family) ||
    b.version - a.version ||
    a.tier - b.tier ||
    a.base.localeCompare(b.base, undefined, { numeric: true, sensitivity: "base" })
  );
}

export interface ModelDisplayOverride {
  displayName: string | null;
  sortOrder: number | null;
}

interface Row {
  model_id: string;
  display_name: string | null;
  sort_order: number | null;
}

export async function listModelDisplayOverrides(): Promise<Map<string, ModelDisplayOverride>> {
  const { rows } = await sql<Row>`select model_id, display_name, sort_order from model_display`;
  return new Map(rows.map((r) => [r.model_id, { displayName: r.display_name, sortOrder: r.sort_order }]));
}

/** `patch` fields left `undefined` are untouched; pass `null` explicitly to clear one back to "use the default". */
export async function setModelDisplayOverride(
  modelId: string,
  patch: { displayName?: string | null; sortOrder?: number | null }
): Promise<void> {
  const { rows } = await sql<Row>`select display_name, sort_order from model_display where model_id = ${modelId}`;
  const current = rows[0];
  const displayName = patch.displayName !== undefined ? patch.displayName : (current?.display_name ?? null);
  const sortOrder = patch.sortOrder !== undefined ? patch.sortOrder : (current?.sort_order ?? null);

  if (displayName === null && sortOrder === null) {
    await sql`delete from model_display where model_id = ${modelId}`;
    return;
  }
  await sql`
    insert into model_display (model_id, display_name, sort_order)
    values (${modelId}, ${displayName}, ${sortOrder})
    on conflict (model_id) do update
      set display_name = excluded.display_name,
          sort_order = excluded.sort_order,
          updated_at = now()
  `;
}

/**
 * Resolves the final {name, order} for one model — override first, else the
 * computed default. `order` is a plain number so the caller can sort by it
 * directly; models without an explicit sort_order still land in the right
 * neighborhood (grouped by family) via a synthetic key derived the same way
 * compareModelsDefault does, just encoded as a single sortable number isn't
 * practical (family grouping isn't linear), so callers should sort with
 * compareModelsDefault as the tiebreaker — see applyModelDisplay().
 */
export function resolveModelDisplay(
  id: string,
  overrides: Map<string, ModelDisplayOverride>,
  catalogName?: string
): { displayName: string; sortOrder: number | null } {
  const override = overrides.get(id);
  return {
    displayName: override?.displayName ?? catalogName ?? cleanModelName(id),
    sortOrder: override?.sortOrder ?? null,
  };
}

/**
 * Sorts a list of {id, sortOrder} by: explicit sortOrder first (ascending,
 * admin-set ones win outright), then the computed family-grouped default
 * for everything else, in the order sortOrder-less items were given.
 */
export function sortByDisplay<T extends { id: string; sortOrder: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== null && b.sortOrder !== null) return a.sortOrder - b.sortOrder;
    if (a.sortOrder !== null) return -1;
    if (b.sortOrder !== null) return 1;
    return compareModelsDefault(a.id, b.id);
  });
}
