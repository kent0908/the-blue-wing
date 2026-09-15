import { NextRequest, NextResponse } from "next/server";
import { get, head } from "@vercel/blob";
import { getLandingMediaPathname, isLandingSlot } from "@/lib/landingMedia";
import { byteRange } from "@/lib/byteRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: NextRequest, ctx: { params: Promise<{ slot: string }> }, headersOnly = false) {
  const { slot } = await ctx.params;
  if (!isLandingSlot(slot)) return NextResponse.json({ error: { message: "無效的區塊" } }, { status: 400 });
  const row = await getLandingMediaPathname(slot);
  if (!row) return NextResponse.json({ error: { message: "這個區塊還沒有上傳媒體" } }, { status: 404 });
  const metadata = await head(row.pathname);
  const headers = new Headers({
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": row.content_type,
    "Content-Length": String(metadata.size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    "Vary": "Range",
  });
  if (headersOnly) return new Response(null, { headers });
  const range = byteRange(req.headers.get("range"), metadata.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${metadata.size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  const blob = await get(row.pathname, {
    access: "private",
    headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
    abortSignal: req.signal,
  });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: { message: "檔案已遺失" } }, { status: 404 });
  // The SDK normalizes successful reads to 200; retain the upstream range headers.
  const contentRange = blob.headers.get("content-range");
  if (contentRange) {
    headers.set("Content-Range", contentRange);
    headers.set("Content-Length", blob.headers.get("content-length") || String(blob.blob.size));
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(blob.stream, { status: 206, headers });
  }
  return new Response(blob.stream, { headers });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slot: string }> }) {
  return serve(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ slot: string }> }) {
  return serve(req, ctx, true);
}