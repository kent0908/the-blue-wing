import { get } from '@vercel/blob';
import { sql } from './db';
import type { AssetRow } from './assets';

const BASE = 'https://console-api.siraya.ai/extapi/v1/assets';
export type ProviderAssetType = 'image' | 'video' | 'audio';
export type ProviderAssetStatus = 'uploading' | 'processing' | 'active' | 'failed' | 'needs_review';
interface Row { id:number; user_id:number; source_asset_id:number|null; provider_asset_id:string|null; name:string; asset_type:ProviderAssetType; status:ProviderAssetStatus; created_at:string; updated_at:string; }
export class ProviderAssetError extends Error {
 constructor(message:string, public status=400, public code='asset_invalid') { super(message); }
}
export function providerAssetsConfigured() { return Boolean(process.env.SIRAYA_ASSET_API_KEY || process.env.SIRAYA_API_KEY); }
export function publicProviderAsset(r:Row) {
 return {id:Number(r.id),sourceAssetId:r.source_asset_id===null?null:Number(r.source_asset_id),name:r.name,assetType:r.asset_type,status:r.status,src:r.source_asset_id?`/api/assets/${r.source_asset_id}/raw`:null,createdAt:r.created_at,updatedAt:r.updated_at};
}
export function validAssetId(id:unknown):number {
 if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0) throw new ProviderAssetError('素材編號無效');
 return id;
}
function validName(name:unknown,fallback:string) {
 if(name===undefined) return fallback.slice(0,120);
 if(typeof name!=='string'||!name.trim()||name.length>120) throw new ProviderAssetError('素材名稱需為 1 至 120 個字');
 return name.trim();
}
async function request(path:string,init:RequestInit={}) {
 const key=process.env.SIRAYA_ASSET_API_KEY||process.env.SIRAYA_API_KEY;
 if(!key) throw new ProviderAssetError('素材登錄服務尚未設定',503,'asset_unconfigured');
 let res:Response;
 try {
  res=await fetch(BASE+path,{...init,headers:{...init.headers,Authorization:`Bearer ${key}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)});
 } catch {
  throw new ProviderAssetError('素材服務連線逾時或中斷，請稍後更新狀態；登錄結果尚未確認前請勿重複送出',502,'asset_connection_failed');
 }
 if(init.method==='DELETE' && (res.status===204||res.status===404))return null;
 const body=await res.json().catch(()=>null);
 if(!body || typeof body!=='object') {
  throw new ProviderAssetError('素材服務回傳非預期內容，請稍後再試或聯絡管理員',502,'asset_invalid_response');
 }
 if(!res.ok || body?.isSuccess!==true) {
  const inactive=res.status===403;
  throw new ProviderAssetError(inactive?'素材服務尚未啟用或沒有使用權限，請聯絡管理員':'素材服務暫時無法完成操作，請稍後重試',inactive?503:502,inactive?'asset_feature_inactive':'asset_upstream_error');
 }
 return body.data as Record<string,unknown>;
}
async function owned(userId:number,id:number) {
 validAssetId(id);
 const {rows}=await sql.query<Row>('select * from provider_assets where user_id=$1 and id=$2',[userId,id]);
 if(!rows[0])throw new ProviderAssetError('找不到素材',404,'asset_not_found');
 return rows[0];
}
export async function listProviderAssets(userId:number,page=1,pageSize=20) {
 const size=Math.min(100,Math.max(1,Math.floor(pageSize)||20));
 const p=Math.min(100000,Math.max(1,Math.floor(page)||1));
 const [{rows},{rows:count}]=await Promise.all([
  sql.query<Row>('select * from provider_assets where user_id=$1 order by created_at desc,id desc limit $2 offset $3',[userId,size,(p-1)*size]),
  sql.query<{total:number}>('select count(*)::int as total from provider_assets where user_id=$1',[userId]),
 ]);
 return {assets:rows.map(publicProviderAsset),pagination:{page:p,pageSize:size,total:count[0].total,totalPages:Math.ceil(count[0].total/size)},configured:providerAssetsConfigured()};
}
export async function createProviderAsset(userId:number,assetId:unknown,consent:unknown,name?:unknown) {
 const id=validAssetId(assetId);
 if(consent!==true)throw new ProviderAssetError('請先確認您擁有素材及人物肖像使用授權',400,'asset_consent_required');
 if(!providerAssetsConfigured())throw new ProviderAssetError('素材登錄服務尚未設定',503,'asset_unconfigured');
 const {rows}=await sql.query<AssetRow>('select * from assets where user_id=$1 and id=$2',[userId,id]);
 const source=rows[0];
 if(!source)throw new ProviderAssetError('找不到您擁有的原始素材',404,'asset_not_found');
 const type=source.content_type.split('/')[0] as ProviderAssetType;
 if(!['image','video','audio'].includes(type)||source.content_type==='image/svg+xml')throw new ProviderAssetError('請使用一般圖片、影片或音訊素材');
 if(source.size>32*1024*1024)throw new ProviderAssetError('素材超過 32 MB 上限');
 const label=validName(name,source.filename||`素材${id}`);
 const {rows:claimed}=await sql.query<Row>(`insert into provider_assets(user_id,source_asset_id,name,asset_type,status,consent_at) values($1,$2,$3,$4,'uploading',now()) on conflict(user_id,source_asset_id) do nothing returning *`,[userId,id,label,type]);
 if(!claimed[0]) {
  const existing=await sql.query<Row>('select * from provider_assets where user_id=$1 and source_asset_id=$2',[userId,id]);
  if(!existing.rows[0])throw new ProviderAssetError('素材狀態已變更，請重新整理',409);
  return publicProviderAsset(existing.rows[0]);
 }
 const row=claimed[0];
 let submitted=false;
 try {
  const blob=await get(source.pathname,{access:'private'});
  if(!blob||blob.statusCode!==200)throw new ProviderAssetError('原始素材無法讀取',404);
  const bytes=await new Response(blob.stream).arrayBuffer();
  if(bytes.byteLength>32*1024*1024)throw new ProviderAssetError('素材超過 32 MB 上限');
  const form=new FormData();form.append('assetType',type);form.append('name',label);form.append('file',new Blob([bytes],{type:source.content_type}),source.filename||`asset-${id}`);
  submitted=true;
  const data=await request('',{method:'POST',body:form});
  // IDs are opaque: production uses asset-YYYY... in addition to the a-... documentation examples.
  if(typeof data?.assetId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(data.assetId))throw new ProviderAssetError('素材服務回應不完整，請聯絡管理員',502);
  const status=data.status==='active'?'active':data.status==='failed'?'failed':'processing';
  const {rows:saved}=await sql.query<Row>('update provider_assets set provider_asset_id=$1,status=$2,updated_at=now() where id=$3 and user_id=$4 returning *',[data.assetId,status,row.id,userId]);
  return publicProviderAsset(saved[0]);
 } catch(error) {
  // Once submitted, timeout / interrupted persistence is ambiguous. Never automatically upload twice.
  await sql.query('update provider_assets set status=$1,updated_at=now() where id=$2 and user_id=$3',[submitted?'needs_review':'failed',row.id,userId]);
  if(error instanceof ProviderAssetError)throw error;
  throw new ProviderAssetError(submitted?'素材登錄結果待確認，請勿重複上傳，請聯絡管理員':'讀取素材失敗，請稍後重試',502,'asset_upload_uncertain');
 }
}
export async function refreshProviderAsset(userId:number,id:number) {
 const row=await owned(userId,id);
 if(!row.provider_asset_id) {
  if(row.status==='uploading' && Date.now()-new Date(row.updated_at).getTime()>120000) {
   await sql.query("update provider_assets set status='needs_review',updated_at=now() where id=$1 and user_id=$2 and status='uploading'",[id,userId]);row.status='needs_review';
  }
  return publicProviderAsset(row);
 }
 const data=await request('/'+encodeURIComponent(row.provider_asset_id));
 if(data?.assetId!==row.provider_asset_id || data.type!==row.asset_type || !['processing','active','failed'].includes(String(data.status)))throw new ProviderAssetError('素材服務回應無效',502);
 const {rows}=await sql.query<Row>('update provider_assets set status=$1,updated_at=now() where id=$2 and user_id=$3 returning *',[data.status,id,userId]);
 if(!rows[0])throw new ProviderAssetError('素材已刪除',404);
 return publicProviderAsset(rows[0]);
}
export async function renameProviderAsset(userId:number,id:number,name:unknown) {
 await owned(userId,id);
 const label=validName(name,'');
 if(!label)throw new ProviderAssetError('請填寫素材名稱');
 const {rows}=await sql.query<Row>('update provider_assets set name=$1,updated_at=now() where id=$2 and user_id=$3 returning *',[label,id,userId]);
 if(!rows[0])throw new ProviderAssetError('素材已刪除',404);
 return publicProviderAsset(rows[0]);
}
export async function deleteProviderAsset(userId:number,id:number) {
 const row=await owned(userId,id);
 if(row.status==='uploading'||row.status==='needs_review')throw new ProviderAssetError('登錄結果尚未確認，請聯絡管理員處理後再刪除',409,'asset_needs_review');
 if(row.provider_asset_id)await request('/'+encodeURIComponent(row.provider_asset_id),{method:'DELETE'});
 await sql.query('delete from provider_assets where id=$1 and user_id=$2',[id,userId]);
}
export async function resolveProviderAssetReferences(userId:number,ids:number[]) {
 if(!Array.isArray(ids)||ids.length>12)throw new ProviderAssetError('登錄素材數量超過上限');
 ids.forEach(validAssetId);
 if(new Set(ids).size!==ids.length)throw new ProviderAssetError('請勿重複選取相同素材');
 const out:{type:ProviderAssetType;url:string;role:'reference_image'|'reference_video'|'reference_audio'}[]=[];
 for(const id of ids) {
  const fresh=await refreshProviderAsset(userId,id);
  if(fresh.status!=='active')throw new ProviderAssetError('素材仍在處理中或未通過審核，尚不能生成',409,'asset_not_active');
  const row=await owned(userId,id);
  if(!row.provider_asset_id||row.status!=='active')throw new ProviderAssetError('素材狀態已變更',409);
  out.push({type:row.asset_type,url:`asset://${row.provider_asset_id}`,role:`reference_${row.asset_type}`});
 }
 return out;
}
