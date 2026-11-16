import type { NextRequest } from "next/server";
import { assertBusinessOrigin, businessErrorResponse, businessJson, requireBusiness } from "@/lib/business";
import { deleteRegisteredBusinessAsset, refreshBusinessUploadAsset } from "@/lib/businessAssetUploads";

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

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    await deleteRegisteredBusinessAsset(auth.user.id, auth.account.id, id);
    return businessJson({ deleted: true });
  } catch (error) { return businessErrorResponse(req, error); }
}
