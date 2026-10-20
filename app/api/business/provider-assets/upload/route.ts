import type { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { assertBusinessOrigin, BusinessError, businessErrorResponse, businessJson, readBusinessJson, requireBusiness } from "@/lib/business";
import { BUSINESS_UPLOAD_TYPES, businessDirectUploadReady, businessUploadTokenOptions, completeBusinessUpload, initializeBusinessUpload, listBusinessUploads } from "@/lib/businessAssetUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try { return businessJson({ directUpload: businessDirectUploadReady(), types: BUSINESS_UPLOAD_TYPES, uploads: await listBusinessUploads(auth.user.id, auth.account.id) }); }
  catch (error) { return businessErrorResponse(req, error); }
}

/** Large bytes travel browser → private Blob, never through a Vercel function body. */
export async function POST(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    const body = await readBusinessJson(req);
    if (body.type === "blob.generate-client-token") {
      if (!businessDirectUploadReady()) throw new BusinessError("business_asset_storage_unavailable", 503);
      const result = await handleUpload({
        request: req, body: body as unknown as HandleUploadBody,
        onBeforeGenerateToken: (pathname, payload) => businessUploadTokenOptions(auth.user.id, auth.account.id, pathname, payload),
        // No completion callback is configured. The authenticated browser
        // explicitly finalizes, so a webhook cannot create or register assets.
      });
      return businessJson(result);
    }
    if (body.action === "initialize") return businessJson(await initializeBusinessUpload(auth.user.id, auth.account.id, body), 201);
    if (body.action === "complete" && Object.keys(body).every(key => ["action", "uploadId"].includes(key)) && typeof body.uploadId === "string") {
      return businessJson(await completeBusinessUpload(auth.user.id, auth.account.id, body.uploadId));
    }
    throw new BusinessError("business_asset_upload_invalid");
  } catch (error) { return businessErrorResponse(req, error); }
}
