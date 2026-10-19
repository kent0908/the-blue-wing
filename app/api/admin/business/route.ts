import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { assertBusinessOrigin, businessErrorResponse, businessJson, businessNoStore, listBusinessAccounts, readBusinessJson, reviewBusinessAccount } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return businessNoStore(auth.error);
  try {
    return businessJson({ accounts: await listBusinessAccounts() });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireAdmin(req);
    if ("error" in auth) return businessNoStore(auth.error);
    const account = await reviewBusinessAccount(auth.user.id, await readBusinessJson(req));
    return businessJson({ account });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
