import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { listOfficialCharacters, toPublicOfficial } from "@/lib/officialCharacters";
import { getOfficialClone } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/official-characters — the published 官方角色 roster. Works signed
 * out (the roster is public); signed in, each entry also carries the
 * caller's own copy (`adopted`) so the page can show "繼續聊天 · 好感度 N".
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req).catch(() => null);
    const rows = await listOfficialCharacters();
    const clones = user ? await Promise.all(rows.map((r) => getOfficialClone(user.id, r.key))) : rows.map(() => null);
    return NextResponse.json({ characters: rows.map((r, i) => toPublicOfficial(r, clones[i])), signedIn: !!user });
  } catch (err) {
    return errorResponse(err);
  }
}
