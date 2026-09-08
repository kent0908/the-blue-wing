import { modelLabel } from "./modelLabel";
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
  return modelLabel(id);
}

interface SortKey {
  family: string;
  base: string;
  isNsfw: boolean;
}

function sortKeyOf(id: string): SortKey {
  const cleaned = cleanModelName(id);
  const isNsfw = /^NSFW-/i.test(cleaned);
  const base = cleaned.replace(/^NSFW-/i, "").toLowerCase();
  const family = base.match(/^[a-z]+/)?.[0] ?? base;
  return { family, base, isNsfw };
}

/**
 * Default ordering with no admin input at all: every plain (non-NSFW) model
 * first, grouped by family (Seedance next to Seedance, not scattered
 * between Veo and Gemini) and version-aware within that (so "2.5" sorts
 * after "2.0", not before "10.0" alphabetically) — then every NSFW model
 * as its own block at the very end, grouped and version-sorted the same
 * way. Keeping the NSFW block entirely separate (rather than interleaved
 * right after each plain counterpart) is deliberate: a normal-use picker
 * shouldn't have an NSFW entry show up in the middle of the list you
 * actually scroll through.
 */
export function compareModelsDefault(idA: string, idB: string): number {
  const a = sortKeyOf(idA);
  const b = sortKeyOf(idB);
  return (
    Number(a.isNsfw) - Number(b.isNsfw) ||
    a.family.localeCompare(b.family) ||
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
    displayName: modelLabel(override?.displayName ?? catalogName ?? id),
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
