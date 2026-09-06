import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiauth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the stored scene from growing unbounded — a captured screenshot or a
// recorded clip never lives in here (those go through /api/assets and
// /api/video-refs instead), but there's nothing stopping a very long
// waypoint path, so cap the raw JSON size as a sanity backstop.
const MAX_SCENE_BYTES = 512 * 1024;

/**
 * GET/PUT /api/director3d — the standalone /canvas/director3d page's real,
 * per-account scene storage (replacing the earlier localStorage-only
 * autosave). Isolation is ordinary per-user row scoping, the same pattern
 * every other table in this app uses: `where user_id = <the authenticated
 * user>` on every query, enforced by requireUser() up front — there's no
 * separate "framework" needed for this, it's the same guarantee
 * /api/canvas, /api/assets, /api/characters etc. already give.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const { rows } = await sql<{ scene: unknown }>`
    select scene from director3d_scenes where user_id = ${auth.user.id} limit 1
  `;
  return NextResponse.json({ scene: rows[0]?.scene ?? null });
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "格式錯誤" } }, { status: 400 });
  }
  const scene = (body as { scene?: unknown } | null)?.scene;
  if (!scene || typeof scene !== "object" || !Array.isArray((scene as { characters?: unknown }).characters)) {
    return NextResponse.json({ error: { message: "場景資料格式不正確" } }, { status: 400 });
  }
  if (JSON.stringify(scene).length > MAX_SCENE_BYTES) {
    return NextResponse.json({ error: { message: "場景資料太大" } }, { status: 400 });
  }

  await sql`
    insert into director3d_scenes (user_id, scene, updated_at)
    values (${auth.user.id}, ${JSON.stringify(scene)}::jsonb, now())
    on conflict (user_id) do update set scene = excluded.scene, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
