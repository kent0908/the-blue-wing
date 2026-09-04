import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";
import { requireUser } from "@/lib/apiauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/download?url=<generation output url>&name=<suggested filename>
 *
 * Generated images/videos live on the provider's own storage (Volces TOS for
 * Seedance, various CDNs for the image families) which mostly doesn't send
 * CORS headers, so the browser can display them in <img>/<video> but a
 * client-side fetch()-to-Blob download is blocked. This proxies the bytes
 * through our own origin with Content-Disposition: attachment so the browser
 * always saves instead of navigating.
 *
 * Only signed-in users can call this, and only to fetch http(s) URLs that
 * don't resolve to a private/loopback/link-local address; this is an open
 * fetch-by-URL endpoint, so those checks exist to stop it being used as an
 * SSRF pivot against internal/cloud-metadata addresses.
 */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const a = parts[0];
    const b = parts[1];
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd");
  }
  return true; // not a recognisable IP - treat as unsafe
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 150);
  return cleaned || "blue-wing-download";
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const rawUrl = req.nextUrl.searchParams.get("url");
  const rawName = req.nextUrl.searchParams.get("name") || "blue-wing-download";
  if (!rawUrl) {
    return NextResponse.json({ error: { message: "缺少 url 參數" } }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: { message: "無效的網址" } }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: { message: "只允許 http(s) 網址" } }, { status: 400 });
  }

  try {
    const addresses = await dns.lookup(target.hostname, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
      return NextResponse.json({ error: { message: "不允許的網址" } }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: { message: "無法解析網址主機" } }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { redirect: "follow" });
  } catch {
    return NextResponse.json({ error: { message: "下載來源時發生錯誤" } }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: { message: `來源回應失敗（${upstream.status}）` } }, { status: 502 });
  }

  const safeName = safeFilename(rawName);
  const contentLength = upstream.headers.get("content-length");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      ...(contentLength ? { "Content-Length": contentLength } : {}),
    },
  });
}
