import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import {
  listBlocks,
  createBlock,
  saveBlock,
  deleteBlock,
  SECTIONS,
  type Section,
} from "@/lib/homeBlocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/home-blocks — every block (active + inactive). */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  return NextResponse.json({ blocks: await listBlocks(true) });
}

/** POST /api/admin/home-blocks  { section } — create an empty block. */
export async function POST(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  const body = await req.json().catch(() => ({}));
  const section = body.section as Section;
  if (!SECTIONS.includes(section)) {
    return NextResponse.json({ error: { message: "section 不正確", code: "bad_section" } }, { status: 400 });
  }
  return NextResponse.json({ block: await createBlock(section) }, { status: 201 });
}

/** PATCH /api/admin/home-blocks — full-row save. */
export async function PATCH(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: { message: "id 不正確", code: "bad_id" } }, { status: 400 });
  }
  await saveBlock({
    id,
    sort: Number(b.sort) || 0,
    title: String(b.title ?? ""),
    subtitle: String(b.subtitle ?? ""),
    badge: b.badge ? String(b.badge) : null,
    asset_id: b.asset_id ? Number(b.asset_id) : null,
    target_mode: b.target_mode ? String(b.target_mode) : null,
    model_id: b.model_id ? String(b.model_id) : null,
    prompt: b.prompt ? String(b.prompt) : null,
    params: b.params && typeof b.params === "object" ? b.params : {},
    active: b.active !== false,
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/home-blocks?id= */
export async function DELETE(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: { message: "id 不正確", code: "bad_id" } }, { status: 400 });
  }
  await deleteBlock(id);
  return NextResponse.json({ ok: true });
}
