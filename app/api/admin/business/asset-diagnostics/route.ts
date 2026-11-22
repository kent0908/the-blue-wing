import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { BusinessError, businessErrorResponse, businessJson, businessNoStore, getBusinessAccount, getBusinessCredential, getBusinessCredentialMetadata } from "@/lib/business";
import { businessDirectUploadReady, listBusinessUploads } from "@/lib/businessAssetUploads";
import { listBusinessProviderAssets } from "@/lib/businessProviderAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const failure = (error: unknown) => ({
  available: false as const,
  code: error instanceof BusinessError && /^[a-z][a-z0-9_]{0,63}$/.test(error.code) ? error.code : "unavailable",
  httpStatus: error instanceof BusinessError ? error.status : 503,
});

/** Admin-only read checks use the selected customer's current key. Never return keys, envelopes, asset names or media URLs. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return businessNoStore(auth.error);
  try {
    const params = req.nextUrl.searchParams;
    const raw = params.get("userId") ?? "";
    if (params.getAll("userId").length !== 1 || Array.from(params.keys()).some(key => key !== "userId" && key !== "view") ||
      params.has("view") && (params.getAll("view").length !== 1 || params.get("view") !== "html") ||
      !/^[1-9]\d{0,15}$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new BusinessError("invalid_body");
    const userId = Number(raw);
    const account = await getBusinessAccount(userId);
    if (!account) throw new BusinessError("account_not_found", 404);
    if (account.status !== "approved") throw new BusinessError(account.status === "suspended" ? "business_suspended" : "business_not_approved", 403);
    const originalCheck = async () => {
      try { const uploads = await listBusinessUploads(userId, account.id); return { available: true, count: uploads.length }; }
      catch (error) { return failure(error); }
    };
    const providerCheck = async () => {
      try {
        const metadata = await getBusinessCredentialMetadata(userId, account.id);
        const credential = await getBusinessCredential(userId, account.id);
        if (!credential) throw new BusinessError("credential_required", 409);
        await listBusinessProviderAssets({ page: 1, pageSize: 30 }, { apiKey: credential.apiKey });
        return { available: true, credentialId: credential.id, keyLast4: metadata?.id === credential.id ? metadata.last4 : undefined };
      } catch (error) { return failure(error); }
    };
    const [originals, provider] = await Promise.all([originalCheck(), providerCheck()]);
    const report = { checkedAt: new Date().toISOString(), userId, accountStatus: account.status,
      storage: { configured: businessDirectUploadReady() }, originals, provider };
    if (params.get("view") === "html") {
      const text = JSON.stringify(report, null, 2).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return businessNoStore(new Response(`<!doctype html><meta charset="utf-8"><pre>${text}</pre>`, { headers: {
        "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      } }));
    }
    return businessJson(report);
  } catch (error) { return businessErrorResponse(req, error); }
}
