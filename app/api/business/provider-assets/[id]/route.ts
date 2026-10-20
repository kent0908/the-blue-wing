import type { NextRequest } from "next/server";
import { businessErrorResponse, businessJson, requireBusiness } from "@/lib/business";
import { refreshBusinessUploadAsset } from "@/lib/businessAssetUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    const { id } = await context.params;
    return businessJson({ asset: await refreshBusinessUploadAsset(auth.user.id, auth.account.id, id) });
  } catch (error) { return businessErrorResponse(req, error); }
}
