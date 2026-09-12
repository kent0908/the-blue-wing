import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/apiauth";
import { blobConfigured } from "@/lib/assets";
import { ALLOWED_VIDEO_REF_TYPES, MAX_VIDEO_REF_BYTES_DIRECT, VIDEO_REF_PATHNAME_RE } from "@/lib/videoRefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function directUploadAvailable(): boolean {
  return blobConfigured() && !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** GET — availability probe for the browser (see app/api/assets/upload for why a static RW token is required). */
export async function GET() {
  return NextResponse.json({ available: directUploadAvailable(), maxBytes: MAX_VIDEO_REF_BYTES_DIRECT });
}

/**
 * POST /api/video-refs/upload — client-upload token issuer for 3D導演台
 * 運鏡 reference clips (see ../route.ts for the legacy ≤4MB multipart path
 * and the trust model). The browser picks the random 128-bit token in the
 * filename itself — that's fine: the token's job is to make the serving URL
 * unguessable to third parties, and the uploader is a signed-in user who
 * could fetch their own clip anyway. The regex below pins the exact shape
 * so nothing outside `video-refs/<hex32>.<ext>` can be written with this
 * token, and no random suffix is added so the URL handed to SIRAYA matches
 * what the serving route accepts.
 */
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
        if (!VIDEO_REF_PATHNAME_RE.test(pathname)) throw new Error("上傳路徑不正確");
        return {
          allowedContentTypes: Object.keys(ALLOWED_VIDEO_REF_TYPES),
          maximumSizeInBytes: MAX_VIDEO_REF_BYTES_DIRECT,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ userId: auth.user.id }),
          callbackUrl: new URL("/api/video-refs/upload", req.url).toString(),
        };
      },
      onUploadCompleted: async () => {
        // nothing to record — the URL itself is the reference (see module comment)
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : "上傳失敗", code: "upload_token_failed" } }, { status: 400 });
  }
}
