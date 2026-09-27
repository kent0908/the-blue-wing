import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { trFor } from "@/lib/i18n/tr";
import { localeFromRequest } from "@/lib/i18n/server";
import { ADULT_MIN_AGE, checkBirthDate, isAdultVerified } from "@/lib/adultGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — does this account already clear the 陪聊 age gate? */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  return NextResponse.json({ verified: isAdultVerified(r.user), minAge: ADULT_MIN_AGE });
}

/**
 * POST { birthDate: "YYYY-MM-DD" } — declare a date of birth for the gate.
 *
 * A rejected date is not stored. Keeping an under-18 date would be the more
 * "complete" record, but it turns a single mistyped year into a permanent
 * lockout with no way back, and the row it would create has no use: the gate
 * reads adult_confirmed_at, and a genuine minor must simply not pass.
 */
export async function POST(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  const tr = trFor(localeFromRequest(req));

  const body = await req.json().catch(() => ({}));
  const verdict = checkBirthDate(body?.birthDate);
  if (!verdict.ok) {
    // A malformed date is the caller's mistake (400); being under age is a
    // refusal to serve (403). Collapsing both into 403 made a typo look like a
    // rejection, and the client shows a permanent "under 18" dead end for it.
    const status = verdict.code === "invalid_date" ? 400 : 403;
    return NextResponse.json({ error: { message: tr(verdict.message), code: verdict.code } }, { status });
  }

  await sql`
    update users
    set birth_date = ${verdict.birthDate}::date,
        adult_confirmed_at = coalesce(adult_confirmed_at, now())
    where id = ${r.user.id}
  `;
  return NextResponse.json({ verified: true, minAge: ADULT_MIN_AGE });
}
