import type { NextRequest } from "next/server";
import { isAdultVerified } from "@/lib/adultGate";
import { assertBusinessOrigin, businessErrorResponse, businessJson, BusinessError, requireBusiness, readBusinessJson } from "@/lib/business";
import { availableBusinessModels } from "@/lib/businessGeneration";
import { estimateBusinessPrice, type BusinessPriceSettings } from "@/lib/businessPricePreview";
import { sirayaPriceRules } from "@/lib/sirayaPriceCatalog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertBusinessOrigin(req);
    const auth = await requireBusiness(req);
    if ("error" in auth) return auth.error;
    const body = await readBusinessJson(req, 2048);
    if (typeof body.model !== "string" || !/^[a-z0-9._:-]{1,150}$/i.test(body.model) || /^(?:sk|csk)-/i.test(body.model) ||
        (body.kind !== "image" && body.kind !== "video" && body.kind !== "text") ||
        typeof body.videoInput !== "boolean" || typeof body.rewrite !== "boolean" ||
        typeof body.referenceCount !== "number" || !Number.isSafeInteger(body.referenceCount) || body.referenceCount < 0 || body.referenceCount > 50 ||
        (body.audio !== undefined && typeof body.audio !== "boolean")) throw new BusinessError("invalid_parameters", 400);
    const settings: BusinessPriceSettings = { model: body.model, kind: body.kind, videoInput: body.videoInput,
      referenceCount: body.referenceCount, rewrite: body.rewrite, audio: body.audio };
    if (typeof body.seconds === "number" && Number.isSafeInteger(body.seconds) && body.seconds >= -1 && body.seconds <= 120) settings.seconds = body.seconds;
    if (typeof body.count === "number" && Number.isSafeInteger(body.count) && body.count > 0 && body.count <= 50) settings.count = body.count;
    for (const field of ["resolution", "aspect", "size"] as const) {
      const val = body[field];
      if (typeof val === "string" && /^[\w:×.-]{1,24}$/.test(val)) settings[field] = val;
    }
    if (/(?:^|-)(?:nsfw|uncensored|spicy)(?:-|$)/i.test(settings.model) && !isAdultVerified(auth.user))
      throw new BusinessError("age_unverified", 403);

    const publicRules = await sirayaPriceRules(settings.model, "public").catch(() => []);
    const preview = estimateBusinessPrice(settings, publicRules);
    if (preview.reason === "unavailable") {
      // Private listings are only queried after confirming the customer's key
      // actually grants the exact variant. Never substitute the base model's price.
      const catalog = await availableBusinessModels(auth.user.id, auth.account.id).catch(() => null);
      const model = catalog?.models.find(model => model.id.toLowerCase() === settings.model.toLowerCase() && model.modality === settings.kind);
      if (model && (!model.nsfw || isAdultVerified(auth.user))) {
        const rules = await sirayaPriceRules(model.id, "console").catch(() => []);
        if (rules.length) return businessJson({ preview: estimateBusinessPrice(settings, rules) });
      }
    }
    return businessJson({ preview });
  } catch (error) {
    return businessErrorResponse(req, error);
  }
}
