import type { NextRequest } from "next/server";
import { checkBirthDate } from "@/lib/adultGate";
import { sql } from "@/lib/db";
import { assertBusinessOrigin, BusinessError, businessErrorResponse, businessJson, readBusinessJson, requireBusiness } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reuses the existing server-checked date declaration; this is not an identity check. */
export async function POST(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    const body = await readBusinessJson(req);
    if (Object.keys(body).some(key => key !== "birthDate")) throw new BusinessError("invalid_body");
    const verdict = checkBirthDate(body.birthDate);
    if (!verdict.ok) throw new BusinessError(verdict.code, verdict.code === "under_age" ? 403 : 400);
    // Re-check approval in the write rather than trusting a prior screen or cached auth result.
    const { rows } = await sql`update users set birth_date=${verdict.birthDate}::date,adult_confirmed_at=coalesce(adult_confirmed_at,now())
      where id=${auth.user.id} and exists(select 1 from business_accounts where id=${auth.account.id} and user_id=${auth.user.id} and status='approved') returning id`;
    if (!rows.length) throw new BusinessError("business_not_approved", 403);
    return businessJson({ verified: true, minAge: 18 });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
