import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { persistGeneratedMedia } from "@/lib/mediaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** TEMP debug route — diagnosing why persistGeneratedMedia silently falls back. Delete after. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  try {
    const url = await persistGeneratedMedia(String(body.url), { userId: auth.user.id, kind: body.kind === "video" ? "video" : "image", debugRethrow: true });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err) }, { status: 500 });
  }
}
