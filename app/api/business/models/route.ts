import { NextRequest } from "next/server";
import { requireBusiness, businessJson, businessErrorResponse } from "@/lib/business";
import { availableBusinessModels } from "@/lib/businessGeneration";
import { isAdultVerified } from "@/lib/adultGate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try { return businessJson({ ...(await availableBusinessModels(auth.user.id, auth.account.id)), adultVerified: isAdultVerified(auth.user) }); }
  catch (error) { return businessErrorResponse(req, error); }
}
