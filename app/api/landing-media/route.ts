import { NextResponse } from "next/server";
import { getLandingMediaMap } from "@/lib/landingMedia";

export const runtime = "nodejs";
export const revalidate = 300;

/**
 * GET /api/landing-media — public, no auth: which slots currently have an
 * admin-uploaded override, and the (proxied) URL to fetch each one's bytes
 * from. Consumed by the admin page's own listing UI; app/page.tsx reads the
 * same data directly via getLandingMediaMap() since it's a server component.
 */
export async function GET() {
  const map = await getLandingMediaMap();
  return NextResponse.json({ media: map });
}
