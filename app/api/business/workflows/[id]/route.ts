import { NextRequest } from "next/server";
import { assertBusinessOrigin, businessErrorResponse, businessJson, requireBusiness } from "@/lib/business";
import { getBusinessWorkflow, readBusinessWorkflowJson, saveBusinessWorkflow } from "@/lib/businessWorkflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Context) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try { return businessJson({ workflow: await getBusinessWorkflow(auth.user.id, auth.account.id, (await ctx.params).id) }); }
  catch (error) { return businessErrorResponse(req, error); }
}
export async function PUT(req: NextRequest, ctx: Context) {
  const auth = await requireBusiness(req);
  if ("error" in auth) return auth.error;
  try {
    assertBusinessOrigin(req);
    return businessJson({ workflow: await saveBusinessWorkflow(auth.user.id, auth.account.id, (await ctx.params).id, await readBusinessWorkflowJson(req)) });
  } catch (error) { return businessErrorResponse(req, error); }
}
/** Both verbs share one CAS path; existing CanvasEditor saves with PUT. */
export const PATCH = PUT;
