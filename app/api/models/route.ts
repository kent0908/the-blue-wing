import { NextResponse } from "next/server";
import { listModels } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { modalityOf } from "@/lib/pricing";

export const runtime = "nodejs";
export const revalidate = 300;

/** GET /api/models — proxies GET https://llm.siraya.ai/v1/models */
export async function GET() {
  try {
    const raw = await listModels();
    const data = Array.isArray(raw?.data) ? raw.data : [];
    const models = data.map((m: Record<string, unknown>) => ({
      id: String(m.id),
      ownedBy: (m.owned_by as string) ?? "unknown",
      created: (m.created as number) ?? null,
      modality: modalityOf(String(m.id)),
    }));
    return NextResponse.json({ models });
  } catch (err) {
    return errorResponse(err);
  }
}
