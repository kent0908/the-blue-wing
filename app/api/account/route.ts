import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { toPublicUser } from "@/lib/db";
import { getBalance, recentLedger } from "@/lib/credits";
import { getPlan, PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's own account: balance, plan, recent credit history. */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  const { user } = r;

  const [credits, ledger] = await Promise.all([getBalance(user.id), recentLedger(user.id, 50)]);
  const plan = getPlan(user.plan_code);

  return NextResponse.json({
    user: toPublicUser(user),
    credits,
    plan,
    plans: PLANS,
    ledger,
  });
}
