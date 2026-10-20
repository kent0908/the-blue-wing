import type { NextRequest } from "next/server";
import { businessErrorResponse, businessNoStore, requireBusiness } from "@/lib/business";
import { businessUploadPreviewResponse } from "@/lib/businessAssetUploads";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest,context:{params:Promise<{id:string}>}){
  const auth=await requireBusiness(req);
  if("error"in auth)return auth.error;
  try{const{id}=await context.params;return businessNoStore(await businessUploadPreviewResponse(auth.user.id,auth.account.id,id,req.signal));}
  catch(error){return businessErrorResponse(req,error);}
}
