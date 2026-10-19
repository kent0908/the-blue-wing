import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { isAdultVerified } from "@/lib/adultGate";
import { applyForBusiness, assertBusinessOrigin, businessErrorResponse, businessJson, businessNoStore, getBusinessAccount, getBusinessCredentialMetadata, isBusinessEncryptionReady, readBusinessJson } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return businessNoStore(auth.error);
  try {
    const account = await getBusinessAccount(auth.user.id);
    const credential = account?.status === "approved" ? await getBusinessCredentialMetadata(auth.user.id, account.id) : null;
    return businessJson({ account, keyConfigured: !!credential, encryptionReady: isBusinessEncryptionReady(), adultVerified: isAdultVerified(auth.user) });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireUser(req);
    if ("error" in auth) return businessNoStore(auth.error);
    const account = await applyForBusiness(auth.user.id, await readBusinessJson(req));
    return businessJson({ account });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
