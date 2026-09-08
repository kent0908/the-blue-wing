import { NextResponse } from "next/server";
import { getLandingMediaMap } from "@/lib/landingMedia";

export const runtime = "nodejs";
// NOT cached (unlike /api/models' revalidate=300, which this was originally
// copied from) — this endpoint's main consumer is the admin page checking
// whether its OWN just-completed upload took effect. A real test run
// (2026-09-06) found the upload → onUploadCompleted → DB write path working
// correctly, but this route kept returning the stale pre-upload snapshot
// for the full 5-minute window regardless, making the admin UI look broken
// even though nothing was actually wrong.
export const dynamic = "force-dynamic";

/**
 * GET /api/landing-media — public, no auth: which slots currently have an
 * admin-uploaded override, and the (proxied) URL to fetch each one's bytes
 * from. Consumed by the admin page's own listing UI; app/landing/page.tsx reads the
 * same data directly via getLandingMediaMap() since it's a server component.
 */
export async function GET() {
  const map = await getLandingMediaMap();
  return NextResponse.json({ media: map });
}
