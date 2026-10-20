import { NextRequest } from "next/server";
import { assertBusinessOrigin, businessErrorResponse, businessJson, readBusinessJson, requireBusiness, BusinessError } from "@/lib/business";
import { syncBusinessGenerationBilling } from "@/lib/businessBilling";
import { sql } from "@/lib/db";
import { publicBusinessGeneration, type BusinessGenerationRow } from "@/lib/businessGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Invoice lookup is separate from paid generation and never changes the consumer credit ledger. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    const body = await readBusinessJson(req, 1024);
    if (Object.keys(body).length) throw new BusinessError("invalid_parameters");
    const { id } = await ctx.params;
    await syncBusinessGenerationBilling(auth.user, auth.account, id);
    const { rows } = await sql.query<BusinessGenerationRow>("select * from business_generations where id=$1 and account_id=$2 and user_id=$3", [id, auth.account.id, auth.user.id]);
    if (!rows[0]) throw new BusinessError("generation_not_found", 404);
    return businessJson({ generation: publicBusinessGeneration(rows[0]) });
  } catch (error) { return businessErrorResponse(req, error); }
}
