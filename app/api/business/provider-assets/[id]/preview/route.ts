import type { NextRequest } from "next/server";
import { businessErrorResponse, getBusinessCredential, requireBusiness } from "@/lib/business";
import { BusinessError } from "@/lib/businessTypes";
import { businessPreviewRange } from "@/lib/businessAssetPreview";
import { businessRegisteredImagePreview } from "@/lib/businessAssetUploads";
import { businessProviderPreviewResponse } from "@/lib/businessProviderAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    const range = businessPreviewRange(req.headers.get("range"));
    const { id } = await context.params;
    const credential = await getBusinessCredential(auth.user.id, auth.account.id);
    if (!credential) throw new BusinessError("credential_unavailable", 403);
    try {
      return await businessProviderPreviewResponse(id, credential, range, req.signal);
    } catch (error) {
      if (!(error instanceof BusinessError) || error.code !== "preview_unavailable" || req.signal.aborted) throw error;
      const original = await businessRegisteredImagePreview(auth.user.id, auth.account.id, credential.id, id, req.signal);
      if (original) return original;
      throw error;
    }
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
