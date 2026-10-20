import { NextRequest } from "next/server";
import { assertBusinessOrigin, businessErrorResponse, businessJson, requireBusiness } from "@/lib/business";
import { createBusinessWorkflow, listBusinessWorkflows, readBusinessWorkflowJson } from "@/lib/businessWorkflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try { return businessJson({ workflows: await listBusinessWorkflows(auth.user.id, auth.account.id) }); }
  catch (error) { return businessErrorResponse(req, error); }
}
export async function POST(req: NextRequest) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    assertBusinessOrigin(req);
    return businessJson({ workflow: await createBusinessWorkflow(auth.user.id, auth.account.id, await readBusinessWorkflowJson(req)) }, 201);
  } catch (error) { return businessErrorResponse(req, error); }
}
