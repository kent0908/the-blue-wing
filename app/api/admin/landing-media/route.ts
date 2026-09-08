import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireAdmin } from "@/lib/apiauth";
import { deleteLandingMediaRow, getLandingMediaPathname, isLandingSlot } from "@/lib/landingMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/admin/landing-media?slot=hero — remove a slot's override (falls back to the built-in CSS visual again). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const slot = req.nextUrl.searchParams.get("slot") || "";
  if (!isLandingSlot(slot)) {
    return NextResponse.json({ error: { message: "無效的區塊" } }, { status: 400 });
  }

  const existing = await getLandingMediaPathname(slot);
  await deleteLandingMediaRow(slot);
  revalidatePath("/landing");
  if (existing) {
    try {
      await del(existing.pathname);
    } catch (err) {
      console.error("failed to delete landing media blob:", err);
    }
  }
  return NextResponse.json({ ok: true });
}
