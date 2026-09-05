import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireUser } from "@/lib/apiauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/media/<pathname> — streams a private Blob object (generated
 * images/videos re-hosted by lib/mediaStore.ts). Same private+proxied
 * pattern as /api/assets/[id]/raw, except ownership here is authorized by
 * prefix-matching the pathname itself (`generations/<userId>/...`) instead
 * of a DB lookup — the pathname already encodes who it belongs to, and
 * nothing else reads/writes this collection.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { path } = await ctx.params;
  const pathname = path.join("/");
  if (!pathname.startsWith(`generations/${auth.user.id}/`)) {
    return NextResponse.json({ error: { message: "無權限存取", code: "forbidden" } }, { status: 403 });
  }

  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: { message: "檔案已遺失", code: "blob_missing" } }, { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
