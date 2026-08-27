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
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (!hasSession && (pathname.startsWith("/admin") || pathname.startsWith("/account"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
