import { NextRequest, NextResponse } from "next/server";
import { businessReferenceResponse } from "@/lib/businessReferenceUrls";
import { BusinessError } from "@/lib/businessTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** SIRAYA reads private references using an opaque, short-lived bearer grant. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    return await businessReferenceResponse(token, req.signal, req.method === "HEAD");
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

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const response = await GET(req, ctx);
  await response.body?.cancel().catch(() => {});
  return new Response(null, { status: response.status, headers: response.headers });
}
