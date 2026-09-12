import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { audit, getSettings, listModelCosts, upsertModelCost } from "@/lib/crm";
import { listRates } from "@/lib/rateCard";
import { publicPrice, priceUnitLabel, PRICE_SOURCE, PRICE_CHECKED } from "@/lib/sirayaPublicPrices";

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
      const tariff = publicPrice(rate.modelId);
      const list = tariff?.price ?? null;
      const actual = list === null ? null : list * (1 - discount / 100);
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
        actualCostUsd: actual === null ? null : Math.round(actual * 1e6) / 1e6,
        priceUnit: priceUnitLabel(tariff),
        inputPriceUsd: tariff?.inputPrice ?? null,
        priceNote: tariff?.note ?? "",
        source: tariff ? PRICE_SOURCE : null,
        checkedAt: tariff ? PRICE_CHECKED : null,
        marginPct: null, // Retail and vendor units differ; require actual usage.
        notes: c?.notes ?? "",
        updatedAt: c?.updated_at ?? null,
      };
    });
    return NextResponse.json({ settings, resolutionMultiplier: {}, rows });
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
    if (body?.listPriceUsd !== undefined) return NextResponse.json({ error: { message: "牌價由 SIRAYA 公開目錄維護；此處僅設定折扣與備註" } }, { status: 400 });
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
