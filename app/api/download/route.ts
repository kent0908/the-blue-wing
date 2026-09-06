import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import { Readable } from "node:stream";
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
 * don't resolve to a private/loopback/link-local address AND that belong to
 * one of their own recorded generations; this is otherwise an open
 * fetch-by-URL endpoint, so those checks exist to stop it being used as an
 * SSRF pivot against internal/cloud-metadata addresses.
 *
 * DNS rebinding: resolving the hostname here and then handing the same
 * hostname to a normal fetch() would let an attacker-controlled DNS record
 * (TTL 0) point somewhere private *after* this check but *before* the actual
 * connection — the two lookups aren't the same lookup. So the real request
 * below connects directly to one of the IPs already validated here (via
 * https.request's `host`), while still sending the correct SNI/Host so TLS
 * certificate verification and virtual-hosting work against the real
 * hostname — the hostname is authenticated, the connection target is pinned.
 */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const a = parts[0];
    const b = parts[1];
    return (
      a >= 224 || (a === 100 && b >= 64 && b <= 127) || a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::" || lower.startsWith("::ffff:") || lower === "::1" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd");
  }
  return true; // not a recognisable IP - treat as unsafe
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 150);
  return cleaned || "blue-wing-download";
}

interface PinnedResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
}

/**
 * Connects to `ip` directly (not `target.hostname` — that's the whole point,
 * see the module comment) but still sends SNI + Host for `target.hostname`,
 * so TLS certificate validation and any host-based routing on the other end
 * both see the real domain. No redirect following — a 3xx comes back as an
 * ordinary response for the caller to reject.
 */
function fetchPinned(target: URL, ip: string, timeoutMs: number): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        servername: target.hostname,
        headers: { Host: target.hostname },
        timeout: timeoutMs,
      },
      (res) => {
        resolve({ statusCode: res.statusCode ?? 502, headers: res.headers, body: res });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const rawUrl = req.nextUrl.searchParams.get("url");
  const rawName = req.nextUrl.searchParams.get("name") || "blue-wing-download";
  if (!rawUrl) {
    return NextResponse.json({ error: { message: "缺少 url 參數" } }, { status: 400 });
  }

  const { rows: owned } = await sql`
    select 1 from generations where user_id = ${auth.user.id} and url = ${rawUrl} limit 1
  `;
  if (!owned.length) {
    return NextResponse.json({ error: { message: "找不到可下載的生成結果" } }, { status: 404 });
  }
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: { message: "無效的網址" } }, { status: 400 });
  }
  if (target.protocol !== "https:" || !!target.username || !!target.password || (!!target.port && target.port !== "443")) {
    return NextResponse.json({ error: { message: "只允許 http(s) 網址" } }, { status: 400 });
  }

  let pinnedIp: string;
  try {
    const addresses = await dns.lookup(target.hostname, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
      return NextResponse.json({ error: { message: "不允許的網址" } }, { status: 400 });
    }
    pinnedIp = addresses[0].address;
  } catch {
    return NextResponse.json({ error: { message: "無法解析網址主機" } }, { status: 400 });
  }

  let upstream: PinnedResponse;
  try {
    upstream = await fetchPinned(target, pinnedIp, 30000);
  } catch {
    return NextResponse.json({ error: { message: "下載來源時發生錯誤" } }, { status: 502 });
  }
  if (upstream.statusCode >= 300 && upstream.statusCode < 400) {
    upstream.body.resume();
    return NextResponse.json({ error: { message: "來源要求重新導向，已拒絕" } }, { status: 502 });
  }
  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    upstream.body.resume();
    return NextResponse.json({ error: { message: `來源回應失敗（${upstream.statusCode}）` } }, { status: 502 });
  }

  const safeName = encodeURIComponent(safeFilename(rawName));
  const contentLengthHeader = upstream.headers["content-length"];
  const contentLength = Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader;

  return new NextResponse(Readable.toWeb(upstream.body) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      ...(contentLength ? { "Content-Length": contentLength } : {}),
    },
  });
}
