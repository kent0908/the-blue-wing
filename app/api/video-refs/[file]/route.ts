import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/video-refs/{token}.{ext} — deliberately NOT behind requireUser.
 * SIRAYA's video-generation backend fetches this URL directly as a
 * video-type input_references entry (see app/api/videos/route.ts) and
 * obviously can't send this app's session cookie, so the only guard is the
 * random 128-bit token baked into the filename itself (checked below by
 * regex) — same trust model as any signed/capability URL. See
 * ../route.ts's module comment for the known lack-of-cleanup limitation.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[0-9a-f]{32}\.(webm|mp4)$/.test(file)) {
    return NextResponse.json({ error: { message: "not found" } }, { status: 404 });
  }

  const result = await get(`video-refs/${file}`, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: { message: "not found" } }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
