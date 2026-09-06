import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { listRates, upsertRate, type Modality } from "@/lib/rateCard";
import { listModels } from "@/lib/siraya";
import { modalityOf } from "@/lib/pricing";
import { getImageModel } from "@/lib/imageModels";
import { listModelDisplayOverrides, resolveModelDisplay } from "@/lib/modelDisplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODALITIES: Modality[] = ["image", "video", "text"];

/** GET /api/admin/rates — current rate rows + the live SIRAYA model list. */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const [rates, raw, overrides] = await Promise.all([
    listRates(),
    listModels().catch(() => ({ data: [] })),
    listModelDisplayOverrides().catch(() => new Map()),
  ]);
  const data = Array.isArray(raw?.data) ? raw.data : [];
  const models = data
    .map((m: Record<string, unknown>) => {
      const id = String(m.id);
      return {
        id,
        modality: modalityOf(id),
        displayName: resolveModelDisplay(id, overrides, getImageModel(id)?.name).displayName,
      };
    })
    .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));

  return NextResponse.json({ rates, models });
}

/** PATCH /api/admin/rates — upsert one model's rate. */
export async function PATCH(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const body = await req.json().catch(() => ({}));
  const modelId = String(body.modelId || "").trim();
  const modality = body.modality as Modality;
  const credits = Number(body.credits);
  const active = body.active !== false;

  if (!modelId || !MODALITIES.includes(modality) || !Number.isFinite(credits) || credits < 0) {
    return NextResponse.json({ error: { message: "參數不正確", code: "bad_input" } }, { status: 400 });
  }

  await upsertRate(modelId, modality, Math.trunc(credits), active);
  return NextResponse.json({ ok: true });
}
