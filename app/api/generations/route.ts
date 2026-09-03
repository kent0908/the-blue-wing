import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { listGenerations } from "@/lib/generations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/generations — the signed-in user's persisted 生成紀錄, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const rows = await listGenerations(auth.user.id, 60);
  return NextResponse.json({
    generations: rows.map((r) => ({
      id: String(r.id),
      kind: r.kind,
      url: r.url ?? undefined,
      text: r.text_content ?? undefined,
      prompt: r.prompt,
      model: r.model,
      createdAt: new Date(r.created_at).getTime(),
    })),
  });
}
