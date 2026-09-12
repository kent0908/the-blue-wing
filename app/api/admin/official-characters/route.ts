import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { listOfficialCharacters, syncOfficialCharacters } from "@/lib/officialCharacters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/official-characters — every template with its idle-video state (admin). */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json({ characters: await listOfficialCharacters(true) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/admin/official-characters — (re)seeds the table from lib/companionOfficialSeed.ts. Idle-video state is preserved. */
export async function POST(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json(await syncOfficialCharacters());
  } catch (err) {
    return errorResponse(err);
  }
}
