import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiauth';
import { deleteProviderAsset, refreshProviderAsset, renameProviderAsset, ProviderAssetError } from '@/lib/providerAssets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
type Context={params:Promise<{id:string}>};
function failure(e:unknown) {return NextResponse.json({error:{message:e instanceof ProviderAssetError?e.message:'素材服務暫時無法使用',code:e instanceof ProviderAssetError?e.code:'asset_unavailable'}},{status:e instanceof ProviderAssetError?e.status:503});}
export async function GET(req:NextRequest,ctx:Context) {
 try{const auth=await requireUser(req);if('error' in auth)return auth.error;return NextResponse.json({asset:await refreshProviderAsset(auth.user.id,Number((await ctx.params).id))});}catch(e){return failure(e);}
}
export async function PATCH(req:NextRequest,ctx:Context) {
 try {
  const auth=await requireUser(req);if('error' in auth)return auth.error;
  let body;try{body=await req.json();}catch{return failure(new ProviderAssetError('請提供有效的素材名稱'));}
  return NextResponse.json({asset:await renameProviderAsset(auth.user.id,Number((await ctx.params).id),body?.name)});
 }catch(e){return failure(e);}
}
export async function DELETE(req:NextRequest,ctx:Context) {
 try{const auth=await requireUser(req);if('error' in auth)return auth.error;await deleteProviderAsset(auth.user.id,Number((await ctx.params).id));return new NextResponse(null,{status:204});}catch(e){return failure(e);}
}
