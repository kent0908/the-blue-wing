import { NextResponse } from "next/server";
import { listModels } from "@/lib/siraya";
import { errorResponse } from "@/lib/errors";
import { modalityOf } from "@/lib/pricing";
import { getImageModel } from "@/lib/imageModels";
import { listModelDisplayOverrides, resolveModelDisplay, sortByDisplay } from "@/lib/modelDisplay";

export const runtime = "nodejs";
export const revalidate = 300;

/**
 * GET /api/models — proxies GET https://llm.siraya.ai/v1/models, layering on
 * the display name / order every picker in the app should actually show
 * (see lib/modelDisplay.ts): an admin override if one's set for this model
 * (/admin/models), else the curated catalogue name for image models, else a
 * vendor-prefix-stripped default — sorted the same way (override sort_order
 * first, else grouped by family) so every list is already in a sane order
 * without per-page sorting logic.
 */
export async function GET() {
  try {
    const [raw, overrides] = await Promise.all([listModels(), listModelDisplayOverrides().catch(() => new Map())]);
    const data = Array.isArray(raw?.data) ? raw.data : [];
    const models = data.map((m: Record<string, unknown>) => {
      const id = String(m.id);
      const { displayName, sortOrder } = resolveModelDisplay(id, overrides, getImageModel(id)?.name);
      return {
        id,
        ownedBy: (m.owned_by as string) ?? "unknown",
        created: (m.created as number) ?? null,
        modality: modalityOf(id),
        displayName,
        sortOrder,
      };
    });
    return NextResponse.json({ models: sortByDisplay(models) });
  } catch (err) {
    return errorResponse(err);
  }
}
