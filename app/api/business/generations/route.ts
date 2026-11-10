import { after, NextRequest } from "next/server";
import { requireBusiness, businessJson, businessErrorResponse, assertBusinessOrigin, readBusinessJson } from "@/lib/business";
import { createBusinessGeneration, findBusinessSubmission, listBusinessGenerations, publicBusinessGeneration } from "@/lib/businessGeneration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    const requestId = req.nextUrl.searchParams.get("clientRequestId");
    if (requestId !== null) return businessJson({ generation: await findBusinessSubmission(auth.user, auth.account, requestId) });
    return businessJson({ generations: await listBusinessGenerations(auth.user, auth.account) });
  }
  catch (error) { return businessErrorResponse(req, error); }
}
export async function POST(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    assertBusinessOrigin(req);
    const body = await readBusinessJson(req, 65536);
    const respondAsync = req.headers.get("prefer")?.split(",").some(value => value.trim().toLowerCase() === "respond-async");
    const result = await createBusinessGeneration(auth.user, auth.account, body, respondAsync ? after : undefined);
    const response = businessJson({ generation: publicBusinessGeneration(result.row), duplicate: result.duplicate }, result.duplicate ? 200 : respondAsync ? 202 : 201);
    if (respondAsync) response.headers.set("Preference-Applied", "respond-async");
    return response;
  } catch (error) { return businessErrorResponse(req, error); }
}
