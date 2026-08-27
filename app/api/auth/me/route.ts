import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toPublicUser } from "@/lib/db";
import { getBalance } from "@/lib/credits";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current session snapshot for the shell: user, credit balance, plan. */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ user: null });

    const credits = await getBalance(user.id);
    const plan = getPlan(user.plan_code);
    return NextResponse.json({
      user: toPublicUser(user),
      credits,
      plan: { code: plan.code, name: plan.name },
    });
  } catch (err) {
    // DB not attached yet, etc. — the shell should still render logged-out.
    console.error("/api/auth/me failed:", err);
    return NextResponse.json({ user: null });
  }
}
