import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/apiauth";
import { ALLOWED_ASSET_TYPES, MAX_ASSET_BYTES_DIRECT, assetPathPrefix, blobConfigured } from "@/lib/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assets/upload — client-upload token issuer for 資產庫 (see
 * @vercel/blob/client's handleUpload, same pattern as the landing-media
 * admin upload). The file goes browser → Blob directly, never through a
 * serverless function body, which is what lifted the old 4MB ceiling
 * (Vercel's ~4.5MB request limit) that ASSET-INTEGRATION.md had listed as
 * "大於4MB需另行實作直傳" — this is that implementation.
 *
 * Two things are pinned in the token so a client can't misuse it: the
 * pathname must sit under the signed-in user's own `assets/<id>/` prefix,
 * and the type/size limits are the library's. The DB row is NOT written
 * from onUploadCompleted — that webhook can't reach a local dev server and
 * is best-effort in general — the browser calls /api/assets/register after
 * the upload resolves instead (which re-verifies the prefix and reads the
 * real size/type back from the store).
 */
// handleUpload signs client tokens with the static read-write token
// specifically (verified in @vercel/blob 2.8's source — OIDC/BLOB_STORE_ID
// is enough for server-side put() but not for client tokens). Without it
// the browser helper falls back to the legacy ≤4MB multipart route.
function directUploadAvailable(): boolean {
  return blobConfigured() && !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** GET /api/assets/upload — lets the browser helper decide up front whether direct upload works on this deployment. */
export async function GET() {
  return NextResponse.json({ available: directUploadAvailable(), maxBytes: MAX_ASSET_BYTES_DIRECT });
}

export async function POST(req: NextRequest) {
  if (!directUploadAvailable()) {
    return NextResponse.json({ error: { message: "目前無法直接上傳大檔，改用一般上傳（單檔 4 MB）", code: "direct_upload_unavailable" } }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: { message: "格式錯誤" } }, { status: 400 });

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const auth = await requireUser(req);
        if ("error" in auth) throw new Error("請先登入");
        const prefix = assetPathPrefix(auth.user.id);
        if (!pathname.startsWith(prefix) || pathname.includes("..") || pathname.length > prefix.length + 120) throw new Error("上傳路徑不正確");
        return {
          allowedContentTypes: Object.keys(ALLOWED_ASSET_TYPES),
          maximumSizeInBytes: MAX_ASSET_BYTES_DIRECT,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: auth.user.id }),
          callbackUrl: new URL("/api/assets/upload", req.url).toString(),
        };
      },
      onUploadCompleted: async () => {
        // Registration happens from the browser (see module comment) — nothing to do here.
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : "上傳失敗", code: "upload_token_failed" } }, { status: 400 });
  }
}
