/**
 * Turn a user's own asset ids into base64 data URLs the SIRAYA router can read
 * directly. The blob store is private, so we can't hand SIRAYA a raw URL — we
 * inline the bytes instead. Order follows `ids`; unknown / other-user ids are
 * silently skipped.
 */
import { get } from "@vercel/blob";
import { sql } from "./db";
import type { AssetRow } from "./assets";
import { MAX_REF_IMAGES } from "./imageModels";

export async function assetsToDataUrls(userId: number, ids: number[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter((n) => Number.isInteger(n)))].slice(0, MAX_REF_IMAGES);
  if (!wanted.length) return [];

  const { rows } = await sql.query<AssetRow>(
    "select * from assets where user_id = $1 and id = any($2::int[])",
    [userId, wanted]
  );
  // Postgres bigint ids come back as strings (to avoid precision loss) — coerce
  // to number so lookups below actually match `wanted`'s numeric ids. Without
  // this, byId.get(id) always misses ("13" !== 13) and every asset is silently
  // skipped: no error, the request just quietly falls back to text-only.
  const byId = new Map(rows.map((a) => [Number(a.id), a]));

  const out: string[] = [];
  for (const id of wanted) {
    const asset = byId.get(id);
    if (!asset) continue;
    const blob = await get(asset.pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200) continue;
    const buf = Buffer.from(await new Response(blob.stream).arrayBuffer());
    out.push(`data:${asset.content_type};base64,${buf.toString("base64")}`);
  }
  return out;
}
