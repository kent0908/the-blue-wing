import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiauth';
import { createProviderAsset, listProviderAssets, ProviderAssetError } from '@/lib/providerAssets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
function assetFailure(e:unknown) {
 return NextResponse.json({error:{message:e instanceof ProviderAssetError?e.message:'素材服務暫時無法使用',code:e instanceof ProviderAssetError?e.code:'asset_unavailable'}},{status:e instanceof ProviderAssetError?e.status:503});
}
export async function GET(req:NextRequest) {
 try {
  const auth=await requireUser(req);if('error' in auth)return auth.error;
  return NextResponse.json(await listProviderAssets(auth.user.id,Number(req.nextUrl.searchParams.get('page')||1),Number(req.nextUrl.searchParams.get('pageSize')||20)));
 }catch(e){return assetFailure(e);}
}
export async function POST(req:NextRequest) {
 try {
  const auth=await requireUser(req);if('error' in auth)return auth.error;
  let body;try{body=await req.json();}catch{return assetFailure(new ProviderAssetError('請提供有效的素材資料'));}
  if(!body||typeof body!=='object'||Array.isArray(body))return assetFailure(new ProviderAssetError('請提供有效的素材資料'));
  return NextResponse.json({asset:await createProviderAsset(auth.user.id,body.assetId,body.consent,body.name)},{status:202});
 }catch(e){return assetFailure(e);}
}
