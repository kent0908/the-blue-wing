import { NextRequest } from "next/server";
import { businessErrorResponse, businessJson, requireBusiness } from "@/lib/business";
import { businessUsageReport } from "@/lib/businessUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try { return businessJson(await businessUsageReport(auth.user, auth.account, req.nextUrl.searchParams)); }
  catch (error) { return businessErrorResponse(req, error); }
}
