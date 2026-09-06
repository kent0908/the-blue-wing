import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getLandingMediaPathname, isLandingSlot } from "@/lib/landingMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/landing-media/:slot — streams the current admin-uploaded blob for
 * one landing-page slot. Deliberately NOT behind requireUser()/ownership —
 * unlike every other blob-proxy route in this app (/api/assets/:id/raw,
 * /api/media/...), this content is meant to be publicly visible on the
 * landing page to anonymous visitors, so there is nothing to authorize.
 * Cached moderately (not "private, no-store" like the per-user routes) since
 * many strangers load the same bytes; short enough that an admin's update
 * shows up within a few minutes without needing a manual cache-bust.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slot: string }> }) {
  const { slot } = await ctx.params;
  if (!isLandingSlot(slot)) {
    return NextResponse.json({ error: { message: "無效的區塊" } }, { status: 400 });
  }

  const row = await getLandingMediaPathname(slot);
  if (!row) {
    return NextResponse.json({ error: { message: "這個區塊還沒有上傳媒體" } }, { status: 404 });
  }

  const blob = await get(row.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: { message: "檔案已遺失" } }, { status: 404 });
  }

  return new Response(blob.stream, {
    headers: {
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": row.content_type,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
