import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { adoptOfficialCharacter } from "@/lib/officialCharacters";
import { toPublicCharacter } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/official-characters/:key/adopt — gives the signed-in user their
 * own copy of the official character (see lib/officialCharacters.ts) and
 * returns it; idempotent, so the page can always call this then navigate to
 * /companions/<id>.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;
  try {
    const { key } = await ctx.params;
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) return NextResponse.json({ error: { message: "找不到這個官方角色", code: "not_found" } }, { status: 404 });
    const { character, created } = await adoptOfficialCharacter(r.user.id, key, req.nextUrl.origin);
    return NextResponse.json({ character: toPublicCharacter(character), created }, { status: created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
