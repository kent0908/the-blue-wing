import { get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { requireBusiness, businessErrorResponse, BusinessError } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Business media always rechecks approval and ownership, including after suspension. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    if (!Array.isArray(path) || path.length !== 3 || path.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === "..") || !["adult", "standard"].includes(path[1])) {
      throw new BusinessError("invalid_media_path", 400);
    }
    const auth = await requireBusiness(req, { adult: path[1] === "adult" });
    if ("error" in auth) return auth.error;
    if (path[0] !== auth.account.id) throw new BusinessError("not_found", 404);
    const range = req.headers.get("range");
    // Accept a single byte range only. Never forward arbitrary browser headers.
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new BusinessError("invalid_range", 416);
    if (range) {
      const [start, end] = range.slice(6).split("-").map(value => value === "" ? null : Number(value));
      if ([start, end].some(value => value !== null && !Number.isSafeInteger(value)) ||
        (start === null && (end === null || end <= 0)) ||
        (start !== null && end !== null && start > end)) throw new BusinessError("invalid_range", 416);
    }
    const result = await get(`business/${path.join("/")}`, {
      access: "private",
      ...(range ? { headers: { Range: range } } : {}),
    });
    if (!result || result.statusCode !== 200) throw new BusinessError("not_found", 404);
    const contentType = result.blob.contentType;
    if (!/^(?:image\/(?:png|jpeg|webp|gif|avif)|video\/(?:mp4|webm|quicktime))(?:;|$)/i.test(contentType)) {
      await result.stream.cancel();
      throw new BusinessError("unsupported_media", 415);
    }
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Accept-Ranges": "bytes",
      "Content-Disposition": `${req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${path[2]}"`,
    });
    const contentRange = result.headers.get("content-range");
    const contentLength = result.headers.get("content-length");
    if (contentRange) headers.set("Content-Range", contentRange);
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(result.stream, { status: contentRange ? 206 : 200, headers });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
