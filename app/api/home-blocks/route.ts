import { NextResponse } from "next/server";
import { listBlocks, toPublicBlock, SECTIONS, type Section, type PublicBlock } from "@/lib/homeBlocks";

export const runtime = "nodejs";
export const revalidate = 60;

/** GET /api/home-blocks — public, active home content grouped by section. */
export async function GET() {
  try {
    const rows = await listBlocks(false);
    const out = Object.fromEntries(SECTIONS.map((s) => [s, [] as PublicBlock[]])) as Record<Section, PublicBlock[]>;
    for (const r of rows) out[r.section].push(toPublicBlock(r));
    return NextResponse.json(out, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json(Object.fromEntries(SECTIONS.map((s) => [s, []])));
  }
}
