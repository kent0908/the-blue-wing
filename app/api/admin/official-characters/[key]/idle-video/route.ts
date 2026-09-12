import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { pollOfficialIdleVideo, startOfficialIdleVideo } from "@/lib/officialCharacters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Admin-only generation of a template's idle loop (SIRAYA-Seedance-2.0-mini,
 * 720p, 10s — see lib/officialCharacters.ts). POST submits the async job,
 * GET polls it; on completion the clip is re-hosted under
 * generations/official/<key>/ and pushed to every existing clone.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const { key } = await ctx.params;
    return NextResponse.json({ character: await startOfficialIdleVideo(key, req.nextUrl.origin) }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const { key } = await ctx.params;
    return NextResponse.json({ character: await pollOfficialIdleVideo(key) });
  } catch (err) {
    return errorResponse(err);
  }
}
