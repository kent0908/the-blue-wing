import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import {
  ALLOWED_ASSET_TYPES,
  MAX_ASSET_BYTES,
  assetPathname,
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
  // Existing image pickers keep their image-only response. The full library opts in.
  const allMedia = req.nextUrl.searchParams.get("media") === "all";
  const { rows } = await sql<AssetRow>`
    select id, user_id, url, pathname, content_type, size, filename, created_at
    from assets where user_id = ${r.user.id}
      and (${allMedia} or content_type like 'image/%')
    order by created_at desc
    limit 300
  `;
  return NextResponse.json({ assets: rows.map(toPublicAsset), configured: blobConfigured() });
}

/**
 * POST /api/assets — multipart form with a `file` field. Stores it in Vercel
 * Blob. Legacy path, capped at MAX_ASSET_BYTES because the bytes pass
 * through this function's request body; the browser now uploads straight to
 * Blob (app/api/assets/upload + /register, via lib/uploadAsset.ts) and only
 * falls back here when that flow is unavailable.
 */
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
      { error: { message: "接受圖片、MP4 / WebM 影片及 MP3 / WAV / M4A 音訊；單檔上限 4 MB", code: "bad_type" } },
      { status: 400 }
    );
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { error: { message: `檔案太大，單檔上限 ${Math.floor(MAX_ASSET_BYTES / 1024 / 1024)} MB`, code: "too_large" } },
      { status: 400 }
    );
  }

  const originalName = (file.name || "asset").slice(0, 120);
  const pathname = assetPathname(r.user.id, originalName);

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
    insert into assets (user_id, url, pathname, content_type, size, filename)
    values (${r.user.id}, ${uploaded.url}, ${uploaded.pathname}, ${file.type}, ${file.size}, ${originalName})
    returning id, user_id, url, pathname, content_type, size, filename, created_at
  `;
  return NextResponse.json({ asset: toPublicAsset(rows[0]) }, { status: 201 });
}
