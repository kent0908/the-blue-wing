import type { NextRequest } from "next/server";
import { businessErrorResponse, businessNoStore } from "@/lib/business";
import { businessUploadSourceResponse } from "@/lib/businessAssetUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    return businessNoStore(await businessUploadSourceResponse(token, req.signal));
  } catch (error) { return businessErrorResponse(req, error); }
}
