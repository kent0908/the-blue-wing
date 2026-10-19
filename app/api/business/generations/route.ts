import { NextRequest } from "next/server";
import { requireBusiness, businessJson, businessErrorResponse, assertBusinessOrigin, readBusinessJson } from "@/lib/business";
import { createBusinessGeneration, listBusinessGenerations, publicBusinessGeneration } from "@/lib/businessGeneration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try { return businessJson({ generations: await listBusinessGenerations(auth.user, auth.account) }); }
  catch (error) { return businessErrorResponse(req, error); }
}
export async function POST(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    assertBusinessOrigin(req);
    const body = await readBusinessJson(req, 65536);
    const result = await createBusinessGeneration(auth.user, auth.account, body);
    return businessJson({ generation: publicBusinessGeneration(result.row), duplicate: result.duplicate }, result.duplicate ? 200 : 201);
  } catch (error) { return businessErrorResponse(req, error); }
}
