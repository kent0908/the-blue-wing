import { NextRequest, NextResponse } from "next/server";
import { getVideoStatus } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/videos/{id}
 * Proxies GET https://llm.siraya.ai/v1/videos/{video_id} for async polling.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const json = await getVideoStatus(id);
    const url = json?.output_url ?? json?.data?.[0]?.url ?? null;
    return NextResponse.json({
      id,
      status: json?.status ?? (url ? "completed" : "processing"),
      url,
      raw: json,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
