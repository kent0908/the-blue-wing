import { NextRequest } from "next/server";
import { requireBusiness, businessJson, businessErrorResponse } from "@/lib/business";
import { getBusinessGeneration, publicBusinessGeneration } from "@/lib/businessGeneration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try { return businessJson({ generation: publicBusinessGeneration(await getBusinessGeneration(auth.user, auth.account, (await ctx.params).id)) }); }
  catch (error) { return businessErrorResponse(req, error); }
}
