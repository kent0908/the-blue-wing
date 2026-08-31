import { NextResponse } from "next/server";
import { listRates } from "@/lib/rateCard";

export const runtime = "nodejs";
export const revalidate = 10;

/** GET /api/rates — public credit rate card, used for the pre-flight quote. */
export async function GET() {
  try {
    const rates = (await listRates())
      .filter((r) => r.active)
      .map((r) => ({ modelId: r.modelId, modality: r.modality, credits: r.credits }));
    return NextResponse.json(
      { rates },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } }
    );
  } catch {
    return NextResponse.json({ rates: [] });
  }
}
