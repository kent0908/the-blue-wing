import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/apiauth";
import { blobConfigured } from "@/lib/assets";
import { ALLOWED_VIDEO_REF_TYPES, MAX_VIDEO_REF_BYTES } from "@/lib/videoRefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/video-refs — multipart form with a `file` field (webm/mp4).
 * Stores it in Vercel Blob under a random 128-bit token and returns an
 * absolute URL SIRAYA's servers can fetch directly, for use as a video-type
 * `input_references` entry (see lib/videoRefs.ts for why this can't just
 * reuse /api/assets — that route requires a logged-in session, which an
 * external API server fetching a reference URL obviously doesn't have).
 *
 * Known limitation: this doesn't delete the blob after the generation job
 * that used it finishes — nothing here does automatic cleanup yet. The
 * random token keeps it unguessable, and it's a small file, but a periodic
 * sweep of stale `video-refs/*` blobs is a reasonable follow-up, not done
 * here.
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

  const ext = ALLOWED_VIDEO_REF_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: { message: "只接受 webm / mp4 影片", code: "bad_type" } }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_REF_BYTES) {
    return NextResponse.json(
      {
        error: {
          message: `影片檔太大，單檔上限 ${Math.floor(MAX_VIDEO_REF_BYTES / 1024 / 1024)} MB — 錄短一點再試`,
          code: "too_large",
        },
      },
      { status: 400 }
    );
  }

  const token = randomBytes(16).toString("hex");
  const filename = `${token}.${ext}`;

  try {
    await put(`video-refs/${filename}`, file, { access: "private", contentType: file.type });
  } catch (err) {
    console.error("video-ref blob put failed:", err);
    return NextResponse.json({ error: { message: "上傳失敗，請稍後再試", code: "upload_failed" } }, { status: 502 });
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/api/video-refs/${filename}` }, { status: 201 });
}
