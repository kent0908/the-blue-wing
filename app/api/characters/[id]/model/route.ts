import { NextRequest, NextResponse } from "next/server";
import { requireAdultUser } from "@/lib/apiauth";
import { setCharacterModel } from "@/lib/characters";
import { errorResponse } from "@/lib/errors";
import { COMPANION_MODELS, isCompanionModel } from "@/lib/companionModels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the five tiers, with what each one costs per message. */
export async function GET(req: NextRequest) {
  const auth = await requireAdultUser(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    models: COMPANION_MODELS.map(({ id, tier, label, blurb, credits, unfiltered }) => ({
      id, tier, label, blurb, credits, unfiltered: !!unfiltered,
    })),
  });
}

/**
 * PUT /api/characters/<id>/model — body: { model: string }
 *
 * Like the voice route, and unlike PATCH /api/characters/<id>: this is the
 * user's own setting on their own copy of the character, so 官方角色 are
 * editable here too. It changes what the next message costs, which is why the
 * response echoes the price rather than leaving the client to guess.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdultUser(req);
  if ("error" in auth) return auth.error;

  try {
    const id = Number((await ctx.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: { message: "角色 id 不正確", code: "bad_id" } }, { status: 400 });
    }

    const model = (await req.json().catch(() => ({})))?.model;
    // Allowlist, not free text: this value is sent to the provider and priced
    // from model_rates, so an unknown id would either fail every message or
    // bill at someone else's rate.
    if (!isCompanionModel(model)) {
      return NextResponse.json({ error: { message: "沒有這個對話模型", code: "unknown_model" } }, { status: 400 });
    }

    const updated = await setCharacterModel(auth.user.id, id, model);
    if (!updated) return NextResponse.json({ error: { message: "找不到這個角色", code: "not_found" } }, { status: 404 });
    return NextResponse.json({ model, credits: COMPANION_MODELS.find((m) => m.id === model)?.credits ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
