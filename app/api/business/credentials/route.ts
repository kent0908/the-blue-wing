import type { NextRequest } from "next/server";
import { assertBusinessOrigin, businessErrorResponse, businessJson, deleteBusinessCredentials, getBusinessCredentialMetadata, readBusinessJson, requireBusiness, saveBusinessCredential } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    return businessJson({ credential: await getBusinessCredentialMetadata(auth.user.id, auth.account.id) });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    const credential = await saveBusinessCredential(auth.user.id, auth.account.id, await readBusinessJson(req));
    return businessJson({ credential });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    await deleteBusinessCredentials(auth.user.id, auth.account.id);
    return businessJson({ deleted: true });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
