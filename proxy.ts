import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Keep in sync with SESSION_COOKIE in lib/auth.ts. Inlined so this file stays
// free of Node-only imports (proxy runs on the Edge runtime).
const SESSION_COOKIE = "bw_session";

/**
 * Next 16 renamed `middleware` → `proxy`. This only does a cheap cookie-presence
 * check to bounce logged-out visitors away from /account and /admin; the real
 * session + role checks happen in the route handlers and pages (Node runtime).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    // Next can canonicalize a loopback IP to localhost in nextUrl. The
    // browser-facing Host preserves the actual origin (including its port).
    const requestOrigin = `${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`;
    if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== requestOrigin)) {
      return NextResponse.json({ error: { message: "不允許跨站操作", code: "cross_origin" } }, { status: 403 });
    }
  }
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (!hasSession && (pathname.startsWith("/admin") || pathname.startsWith("/account") || pathname.startsWith("/crm"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/account/:path*", "/crm/:path*"],
};
