import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";

/** No service-account private key: the production Vercel identity is exchanged for a short-lived token. */
export function gcpConfigured(): boolean {
  return ["GCP_PROJECT_ID", "GCP_PROJECT_NUMBER", "GCP_SERVICE_ACCOUNT_EMAIL", "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"].every(k => !!process.env[k]?.trim());
}
export async function gcpAccessToken(service: "cloud" | "gemini" = "cloud"): Promise<string> {
  if (!gcpConfigured()) throw new Error("GCP identity is not configured");
  const audience = `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`;
  const client = ExternalAccountClient.fromJSON({
    type: "external_account", audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  if (!client) throw new Error("GCP identity configuration is invalid");
  client.scopes = service === "gemini" ? ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/generative-language.retriever"] : ["https://www.googleapis.com/auth/cloud-platform"];
  try {
    const result = await client.getAccessToken();
    if (!result.token) throw new Error("Missing access token");
    return result.token;
  } catch { throw new Error("GCP identity exchange failed; check workload identity permissions"); }
}
