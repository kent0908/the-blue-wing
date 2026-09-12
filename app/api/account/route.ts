import { normalizeNickname } from "@/lib/nickname";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql, toPublicUser } from "@/lib/db";
import { getBalance, recentLedger } from "@/lib/credits";
import { getPlan, PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's own account: balance, plan, recent credit history. */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  const { user } = r;

  const [credits, ledger, generations] = await Promise.all([getBalance(user.id), recentLedger(user.id, 50), sql`select id, kind, model, created_at, duration_ms from generations where user_id=${user.id} order by created_at desc limit 20`]);
  const plan = getPlan(user.plan_code);

  return NextResponse.json({
    user: toPublicUser(user),
    credits,
    plan,
    plans: PLANS,
    ledger,
    generations: generations.rows,
  });
}

/** Only the session owner can change their public display name. */
export async function PATCH(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const body = await req.json();
    const nickname = normalizeNickname(body?.nickname);
    await sql`update users set nickname = ${nickname} where id = ${r.user.id}`;
    return NextResponse.json({ nickname });
  } catch (e) {
    if (e instanceof SyntaxError || (e instanceof Error && e.message.startsWith("暱稱")) || (e instanceof Error && e.message === "請輸入暱稱")) return NextResponse.json({error:{message:e.message}}, {status:400});
    console.error("Nickname update failed");
    return NextResponse.json({error:{message:"暱稱儲存失敗，請稍後再試"}}, {status:500});
  }
}
