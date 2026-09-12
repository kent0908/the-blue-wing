import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { audit, getSettings, listModelCosts, upsertModelCost } from "@/lib/crm";
import { listRates } from "@/lib/rateCard";
import { VIDEO_RESOLUTION_MULTIPLIER } from "@/lib/creditFormula";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/crm/costs — the vendor cost card next to the credit rate card for
 * every model in model_rates: list price, discount, the resulting actual cost
 * per unit, and what we charge in credits, side by side.
 */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const [rates, costs, settings] = await Promise.all([listRates(), listModelCosts(), getSettings()]);
    const costMap = new Map(costs.map((c) => [c.model_id, c]));
    const rows = rates.map((rate) => {
      const c = costMap.get(rate.modelId);
      const discount = c?.discount_pct ?? settings.default_discount_pct;
      const list = c?.list_price_usd ?? 0;
      const actual = list * (1 - discount / 100);
      const sellUsd = rate.credits * settings.credit_value_usd;
      return {
        modelId: rate.modelId,
        modality: rate.modality,
        active: rate.active,
        credits: rate.credits,
        sellUsd: Math.round(sellUsd * 1e6) / 1e6,
        listPriceUsd: list,
        discountPct: c?.discount_pct ?? null,
        effectiveDiscountPct: discount,
        actualCostUsd: Math.round(actual * 1e6) / 1e6,
        marginPct: sellUsd > 0 ? Math.round(((sellUsd - actual) / sellUsd) * 10000) / 100 : null,
        notes: c?.notes ?? "",
        updatedAt: c?.updated_at ?? null,
      };
    });
    return NextResponse.json({ settings, resolutionMultiplier: VIDEO_RESOLUTION_MULTIPLIER, rows });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/crm/costs — body { modelId, listPriceUsd?, discountPct?: number|null, notes? } */
export async function PUT(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const body = (await req.json().catch(() => null)) as { modelId?: unknown; listPriceUsd?: unknown; discountPct?: unknown; notes?: unknown } | null;
    const modelId = typeof body?.modelId === "string" ? body.modelId.trim() : "";
    if (!modelId || modelId.length > 120) return NextResponse.json({ error: { message: "模型代碼不正確" } }, { status: 400 });
    const patch: { listPriceUsd?: number; discountPct?: number | null; notes?: string } = {};
    if (body?.listPriceUsd !== undefined) {
      const v = Number(body.listPriceUsd);
      if (!Number.isFinite(v) || v < 0 || v > 10000) return NextResponse.json({ error: { message: "牌價必須是 0 以上的數字" } }, { status: 400 });
      patch.listPriceUsd = v;
    }
    if (body?.discountPct !== undefined) {
      if (body.discountPct === null || body.discountPct === "") patch.discountPct = null;
      else {
        const v = Number(body.discountPct);
        if (!Number.isFinite(v) || v < 0 || v > 100) return NextResponse.json({ error: { message: "折扣必須在 0 到 100% 之間" } }, { status: 400 });
        patch.discountPct = v;
      }
    }
    if (typeof body?.notes === "string") patch.notes = body.notes.slice(0, 400);
    await upsertModelCost(modelId, patch);
    await audit(r.user.id, "cost_card.update", null, { modelId, ...patch }, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
