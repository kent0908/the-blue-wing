import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import {
  ALLOWED_ASSET_TYPES,
  MAX_ASSET_BYTES,
  blobConfigured,
  toPublicAsset,
  type AssetRow,
} from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/assets — the signed-in user's uploaded assets, newest first. */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const { rows } = await sql<AssetRow>`
    select id, user_id, url, pathname, content_type, size, created_at
    from assets where user_id = ${r.user.id}
    order by created_at desc
    limit 300
  `;
  return NextResponse.json({ assets: rows.map(toPublicAsset), configured: blobConfigured() });
}

/** POST /api/assets — multipart form with a `file` field. Stores it in Vercel Blob. */
export async function POST(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  if (!blobConfigured()) {
    return NextResponse.json(
      { error: { message: "尚未設定素材儲存空間（Vercel Blob），請聯絡管理員", code: "blob_unconfigured" } },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: { message: "格式錯誤", code: "bad_body" } }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: { message: "沒有收到檔案", code: "no_file" } }, { status: 400 });
  }

  const ext = ALLOWED_ASSET_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: { message: "只接受圖片檔（PNG / JPG / WebP / GIF / SVG）", code: "bad_type" } },
      { status: 400 }
    );
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { error: { message: `檔案太大，單檔上限 ${Math.floor(MAX_ASSET_BYTES / 1024 / 1024)} MB`, code: "too_large" } },
      { status: 400 }
    );
  }

  const safe = (file.name || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const pathname = `assets/${r.user.id}/${Date.now()}-${safe}`;

  let uploaded;
  try {
    uploaded = await put(pathname, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
    });
  } catch (err) {
    console.error("blob put failed:", err);
    return NextResponse.json({ error: { message: "上傳失敗，請稍後再試", code: "upload_failed" } }, { status: 502 });
  }

  const { rows } = await sql<AssetRow>`
    insert into assets (user_id, url, pathname, content_type, size)
    values (${r.user.id}, ${uploaded.url}, ${uploaded.pathname}, ${file.type}, ${file.size})
    returning id, user_id, url, pathname, content_type, size, created_at
  `;
  return NextResponse.json({ asset: toPublicAsset(rows[0]) }, { status: 201 });
}
