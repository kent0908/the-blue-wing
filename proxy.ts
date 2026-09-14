import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Keep in sync with SESSION_COOKIE in lib/auth.ts. Inlined so this file stays
// free of Node-only imports (proxy runs on the Edge runtime).
const SESSION_COOKIE = "bw_session";
// Keep in sync with lib/signupSource.ts.
const SOURCE_COOKIE = "bw_src";

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
  const res = NextResponse.next();
  // First-touch attribution: remember where a visitor came from (referrer,
  // UTM tags, landing path) in a 30-day cookie the register route copies
  // into users.signup_source, so the CRM can tell organic / AI-assistant /
  // social sign-ups apart. Set once, never overwritten, never for /api.
  if (!pathname.startsWith("/api/") && !req.cookies.has(SOURCE_COOKIE) && req.method === "GET") {
    const q = req.nextUrl.searchParams;
    const src = {
      ref: (req.headers.get("referer") ?? "").slice(0, 300),
      utm_source: q.get("utm_source")?.slice(0, 80) ?? null,
      utm_medium: q.get("utm_medium")?.slice(0, 80) ?? null,
      utm_campaign: q.get("utm_campaign")?.slice(0, 120) ?? null,
      landing: (pathname + (req.nextUrl.search || "")).slice(0, 300),
      at: new Date().toISOString(),
    };
    res.cookies.set(SOURCE_COOKIE, JSON.stringify(src), { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", httpOnly: true, secure: req.nextUrl.protocol === "https:" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.png|robots.txt|sitemap.xml|opengraph-image|.*\.(?:png|jpg|jpeg|webp|gif|svg|mp4|webm|css|js|map|ico|woff2?)$).*)"],
};
