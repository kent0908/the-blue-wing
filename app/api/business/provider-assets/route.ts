import type { NextRequest } from "next/server";
import { businessErrorResponse, businessJson, getBusinessCredential, requireBusiness } from "@/lib/business";
import { listBusinessProviderAssets, parseBusinessProviderAssetQuery } from "@/lib/businessProviderAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    const options = parseBusinessProviderAssetQuery(req.nextUrl.searchParams);
    const credential = await getBusinessCredential(auth.user.id, auth.account.id);
    if (!credential) return businessJson({ assets: [], pagination: { page: options.page, pageSize: options.pageSize, total: 0, totalPages: 0 }, needsKey: true });
    return businessJson({ ...await listBusinessProviderAssets(options, { apiKey: credential.apiKey }), needsKey: false });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
