import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import { requireAdmin } from "@/lib/apiauth";
import {
  ALLOWED_LANDING_TYPES,
  MAX_LANDING_MEDIA_BYTES,
  getLandingMediaPathname,
  isLandingSlot,
  upsertLandingMedia,
} from "@/lib/landingMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/landing-media/upload — client-upload token issuer +
 * completion webhook for landing-page media (see @vercel/blob/client's
 * handleUpload). Uploads go straight from the admin's browser to Blob
 * storage, not through this (or any) serverless function body — real
 * lesson from earlier the same day: routing a multi-MB file through a
 * Route Handler's JSON/multipart body risks Vercel's ~4.5MB payload limit
 * (see the /api/images/edit 413 fix); a short hero video would hit that
 * easily. The client-upload flow has no such ceiling.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) throw new Error("需要管理員權限");

        let slot: string;
        try {
          slot = (JSON.parse(clientPayload || "{}") as { slot?: string }).slot ?? "";
        } catch {
          slot = "";
        }
        if (!isLandingSlot(slot)) throw new Error("無效的區塊");

        return {
          allowedContentTypes: Object.keys(ALLOWED_LANDING_TYPES),
          maximumSizeInBytes: MAX_LANDING_MEDIA_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ slot }),
          // Explicit, not auto-detected — handleUpload otherwise derives the
          // webhook target from the incoming request's own host header,
          // which is one more thing that can silently pick the wrong value
          // (a specific deployment URL instead of the stable alias, a
          // mismatched protocol, ...) with zero visible error when it does.
          callbackUrl: new URL("/api/admin/landing-media/upload", request.url).toString(),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("landing-media onUploadCompleted fired:", blob.pathname, tokenPayload);
        try {
          const { slot } = JSON.parse(tokenPayload || "{}") as { slot?: string };
          if (!slot || !isLandingSlot(slot)) {
            console.error("landing-media onUploadCompleted: bad slot in tokenPayload:", tokenPayload);
            return;
          }
          const typeInfo = ALLOWED_LANDING_TYPES[blob.contentType];
          const kind = typeInfo?.kind ?? (blob.contentType.startsWith("video/") ? "video" : "image");

          const previous = await getLandingMediaPathname(slot);
          await upsertLandingMedia(slot, kind, blob.pathname, blob.contentType);
          console.log("landing-media upserted:", slot, blob.pathname);
          // Clean up the slot's old file now that the new one is live — best
          // effort, a leftover orphaned blob is wasted storage, not a bug.
          if (previous && previous.pathname !== blob.pathname) {
            try {
              await del(previous.pathname);
            } catch (err) {
              console.error("failed to delete previous landing media blob:", err);
            }
          }
        } catch (err) {
          console.error("landing-media onUploadCompleted failed:", err);
        }
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    console.error("landing-media handleUpload failed:", err);
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : "上傳失敗" } }, { status: 400 });
  }
}
