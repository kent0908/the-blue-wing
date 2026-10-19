import { NextRequest, NextResponse } from "next/server";
import { businessReferenceImageResponse } from "@/lib/businessReferenceUrls";
import { BusinessError } from "@/lib/businessTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SIRAYA has no browser cookie; only an opaque, short-lived, freshly authorized bearer grant can fetch a source image. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    return await businessReferenceImageResponse(token, req.signal);
  } catch (error) {
    const unavailable = !(error instanceof BusinessError) || error.status >= 500;
    return NextResponse.json({ error: { code: unavailable ? "unavailable" : "not_found" } }, {
      status: unavailable ? 503 : 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; sandbox", "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }
}
