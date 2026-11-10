import { NextRequest } from "next/server";
import { assertBusinessOrigin, businessErrorResponse, businessJson, readBusinessJson, requireBusiness } from "@/lib/business";
import { reconcileBusinessUsage } from "@/lib/businessUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reconcile a filtered page of owned receipts without submitting any generations. */
export async function POST(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    const body = await readBusinessJson(req, 4096);
    return businessJson(await reconcileBusinessUsage(auth.user, auth.account, req.nextUrl.searchParams, body, req.signal));
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
