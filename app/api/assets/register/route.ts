import { NextRequest, NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { ALLOWED_ASSET_TYPES, MAX_ASSET_BYTES_DIRECT, assetPathPrefix, toPublicAsset, type AssetRow } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assets/register — body: { pathname, filename? }
 * Second half of a direct browser → Blob upload (see app/api/assets/upload):
 * records the finished blob as one of the signed-in user's 資產庫 assets.
 * Nothing the browser sends is trusted for the row itself — the pathname
 * must be under this user's own prefix (the same prefix the upload token
 * was pinned to), and size/type/url are read back from the store with
 * head(), so a client can't register someone else's file or lie about
 * what it uploaded. Idempotent on pathname: registering the same blob
 * twice returns the existing row.
 */
export async function POST(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const body = (await req.json().catch(() => null)) as { pathname?: unknown; filename?: unknown } | null;
  const pathname = typeof body?.pathname === "string" ? body.pathname : "";
  const prefix = assetPathPrefix(r.user.id);
  if (!pathname.startsWith(prefix) || pathname.includes("..") || pathname.length > prefix.length + 160) {
    return NextResponse.json({ error: { message: "上傳路徑不正確", code: "bad_pathname" } }, { status: 400 });
  }

  const existing = await sql<AssetRow>`
    select id, user_id, url, pathname, content_type, size, filename, created_at
    from assets where user_id = ${r.user.id} and pathname = ${pathname} limit 1
  `;
  if (existing.rows[0]) return NextResponse.json({ asset: toPublicAsset(existing.rows[0]) });

  let meta: Awaited<ReturnType<typeof head>>;
  try {
    meta = await head(pathname);
  } catch {
    return NextResponse.json({ error: { message: "找不到剛上傳的檔案，請重新上傳", code: "blob_missing" } }, { status: 404 });
  }
  const contentType = meta.contentType.split(";")[0].trim();
  if (!ALLOWED_ASSET_TYPES[contentType]) {
    return NextResponse.json({ error: { message: "不支援的檔案格式", code: "bad_type" } }, { status: 400 });
  }
  if (meta.size > MAX_ASSET_BYTES_DIRECT) {
    return NextResponse.json({ error: { message: `檔案太大，單檔上限 ${Math.floor(MAX_ASSET_BYTES_DIRECT / 1024 / 1024)} MB`, code: "too_large" } }, { status: 400 });
  }

  const filename = (typeof body?.filename === "string" && body.filename.trim() ? body.filename.trim() : pathname.slice(prefix.length).replace(/^\d+-/, "")).slice(0, 120);
  const { rows } = await sql<AssetRow>`
    insert into assets (user_id, url, pathname, content_type, size, filename)
    values (${r.user.id}, ${meta.url}, ${meta.pathname}, ${contentType}, ${meta.size}, ${filename})
    returning id, user_id, url, pathname, content_type, size, filename, created_at
  `;
  return NextResponse.json({ asset: toPublicAsset(rows[0]) }, { status: 201 });
}
