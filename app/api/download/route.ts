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

function ipv4Parts(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a >= 224 || (a === 100 && b >= 64 && b <= 127) || a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * A real code-review finding (2026-09-06): the IPv6 branch used to
 * pattern-match known-unsafe PREFIXES only (`::ffff:`, `fe80`, `fc`/`fd`,
 * exact `::`/`::1`) without ever decoding an embedded IPv4 address. IPv6 has
 * two notations that embed a plain IPv4 address in the low 32 bits —
 * `::ffff:a.b.c.d` (mapped) and the older, still-parseable `::a.b.c.d`
 * (compatible) — and the old code treated the FIRST as unconditionally
 * unsafe (overzealous — it blocked public v4-mapped addresses too) while
 * not recognising the SECOND at all, so `::127.0.0.1`, `::10.0.0.1`, or even
 * `::169.254.169.254` (a cloud metadata endpoint, just spelled as
 * IPv4-compatible IPv6) would sail through as "not private". In this route
 * specifically the hostname being resolved is never attacker-chosen (the
 * ownership check above only allows a URL that's already one of the
 * caller's own recorded generation URLs — always our own storage or a
 * trusted upstream provider domain, never user input), so this exact gap
 * wasn't independently reachable — but isPrivateIp() is a general-purpose
 * safety check and shouldn't have a silent bypass built in regardless of
 * what currently calls it. Fixed by extracting any embedded IPv4 address in
 * EITHER notation and checking it with the same v4 rules as a plain address.
 */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ipv4Parts(ip);
    return !parts || isPrivateIpv4(parts);
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();

    const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) {
      const parts = ipv4Parts(mapped[1]);
      return !parts || isPrivateIpv4(parts);
    }
    const compatible = lower.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (compatible) {
      const parts = ipv4Parts(compatible[1]);
      return !parts || isPrivateIpv4(parts);
    }

    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fe80") || // link-local, fe80::/10
      lower.startsWith("fc") || lower.startsWith("fd") || // unique local, fc00::/7
      lower.startsWith("ff") || // multicast, ff00::/8
      lower === "100::" || lower.startsWith("100:0:0:0:") // discard-only, 100::/64
    );
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
