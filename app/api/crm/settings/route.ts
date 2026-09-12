import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { audit, getSettings, saveSettings } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json({ settings: await getSettings(), mail: { configured: !!process.env.RESEND_API_KEY, from: process.env.MAIL_FROM || null } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/crm/settings — body: partial { credit_value_usd, default_discount_pct, usd_to_twd } */
export async function PUT(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: { message: "格式錯誤" } }, { status: 400 });
    const patch: Record<string, number> = {};
    for (const k of ["credit_value_usd", "default_discount_pct", "usd_to_twd"]) {
      if (body[k] === undefined) continue;
      const v = Number(body[k]);
      if (typeof body[k] !== "number" || !Number.isFinite(v) || v < 0 || (k !== "default_discount_pct" && v === 0) || (k === "default_discount_pct" && v > 100)) return NextResponse.json({ error: { message: `${k} 數值不正確` } }, { status: 400 });
      patch[k] = v;
    }
    const settings = await saveSettings(patch);
    await audit(r.user.id, "settings.update", null, patch, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ settings });
  } catch (err) {
    return errorResponse(err);
  }
}
