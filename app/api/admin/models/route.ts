import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { listModels } from "@/lib/siraya";
import { modalityOf } from "@/lib/pricing";
import { getImageModel } from "@/lib/imageModels";
import {
  cleanModelName,
  listModelDisplayOverrides,
  resolveModelDisplay,
  setModelDisplayOverride,
  sortByDisplay,
} from "@/lib/modelDisplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/models — every live model with its current display name/order (override or computed default). */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const [raw, overrides] = await Promise.all([listModels().catch(() => ({ data: [] })), listModelDisplayOverrides()]);
  const data = Array.isArray(raw?.data) ? raw.data : [];
  const models = data.map((m: Record<string, unknown>) => {
    const id = String(m.id);
    const catalogName = getImageModel(id)?.name;
    const override = overrides.get(id);
    const { displayName, sortOrder } = resolveModelDisplay(id, overrides, catalogName);
    return {
      id,
      modality: modalityOf(id),
      defaultName: catalogName ?? cleanModelName(id),
      displayName,
      sortOrder,
      hasOverride: !!override,
    };
  });

  return NextResponse.json({ models: sortByDisplay(models) });
}

/**
 * PATCH /api/admin/models — set one model's override. Either field can be
 * `null` to clear it back to the computed default; omit a field to leave it
 * untouched.
 */
export async function PATCH(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;

  const body = await req.json().catch(() => ({}));
  const modelId = String(body.modelId || "").trim();
  if (!modelId) {
    return NextResponse.json({ error: { message: "缺少 modelId", code: "bad_input" } }, { status: 400 });
  }
  const patch: { displayName?: string | null; sortOrder?: number | null } = {};
  if ("displayName" in body) {
    const name = body.displayName === null ? null : String(body.displayName).trim() || null;
    patch.displayName = name;
  }
  if ("sortOrder" in body) {
    if (body.sortOrder === null) {
      patch.sortOrder = null;
    } else {
      const n = Number(body.sortOrder);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: { message: "排序必須是數字", code: "bad_input" } }, { status: 400 });
      }
      patch.sortOrder = Math.trunc(n);
    }
  }

  await setModelDisplayOverride(modelId, patch);
  return NextResponse.json({ ok: true });
}
