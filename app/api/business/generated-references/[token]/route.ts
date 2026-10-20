import { NextRequest, NextResponse } from "next/server";
import { businessGeneratedImageSourceResponse } from "@/lib/businessGeneratedReferences";
import { BusinessError } from "@/lib/businessTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A generated B image reaches the provider only through an opaque, short-lived, live-authorized source grant. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    return await businessGeneratedImageSourceResponse(token, req.signal);
  } catch (error) {
    const unavailable = !(error instanceof BusinessError) || error.status >= 500;
    return NextResponse.json({ error: { code: unavailable ? "unavailable" : "not_found" } }, {
      status: unavailable ? 503 : 404,
      headers: { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Robots-Tag": "noindex, nofollow, noarchive" },
    });
  }
}
