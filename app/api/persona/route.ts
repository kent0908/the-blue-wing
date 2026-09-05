import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { getPersona, savePersona } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/persona — the caller's own 陪聊身分（跨所有角色共用）. */
export async function GET(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const persona = await getPersona(r.user.id);
  return NextResponse.json({ persona });
}

/** PUT /api/persona — body: { name, bio } */
export async function PUT(req: NextRequest) {
  const r = await requireUser(req);
  if ("error" in r) return r.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 40);
  const bio = String(body?.bio ?? "").trim().slice(0, 500);

  const persona = await savePersona(r.user.id, { name, bio });
  return NextResponse.json({ persona });
}
