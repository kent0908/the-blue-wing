import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { audit } from "@/lib/crm";
import { sendTestEmail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/crm/mail-test — sends a test message to the signed-in admin's own address, to prove the mail provider is wired. */
export async function POST(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ sent: false, error: { message: "尚未設定 RESEND_API_KEY（Vercel 環境變數），目前無法寄信", code: "mail_unconfigured" } }, { status: 503 });
    }
    const result = await sendTestEmail(r.user.email);
    await audit(r.user.id, "mail.test", r.user.id, { sent: result.sent }, req.headers.get("x-forwarded-for"));
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
