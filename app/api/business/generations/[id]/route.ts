import { NextRequest } from "next/server";
import { requireBusiness, businessJson, businessErrorResponse, assertBusinessOrigin, BusinessError } from "@/lib/business";
import { getBusinessGeneration, publicBusinessGeneration } from "@/lib/businessGeneration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    const { id } = await ctx.params;
    const recheck = req.nextUrl.searchParams.get("recheck") === "1";
    if (recheck) {
      const site = req.headers.get("sec-fetch-site");
      if (site === "cross-site" || site === "same-site") throw new BusinessError("invalid_origin", 403);
      if (req.headers.has("origin")) assertBusinessOrigin(req);
    }
    return businessJson({ generation: publicBusinessGeneration(await getBusinessGeneration(auth.user, auth.account, id, recheck)) });
  }
  catch (error) { return businessErrorResponse(req, error); }
}
