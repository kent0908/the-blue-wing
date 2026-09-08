require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
(async()=>{
 const {rows}=await sql.query("select id,source_asset_id,provider_asset_id,name,status,created_at,updated_at from provider_assets where status='needs_review' order by created_at desc limit 20");
 console.log(JSON.stringify({local:rows}));
 const key=process.env.SIRAYA_ASSET_API_KEY||process.env.SIRAYA_API_KEY;if(!key)throw Error('not configured');
 for(let page=1;page<=5;page++) {
  // Never transmit local asset names or identifiers. Match downloaded records locally.
  const url=new URL('https://console-api.siraya.ai/extapi/v1/assets');url.searchParams.set('page',String(page));url.searchParams.set('pageSize','100');
  const r=await fetch(url,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});const j=await r.json().catch(()=>null);
  console.log(JSON.stringify({page,httpStatus:r.status,contentType:r.headers.get('content-type'),isSuccess:j?.isSuccess,pagination:j?.pagination,matches:j?.data?.items?.filter(a=>rows.some(local=>local.name===a.name)).map(a=>({assetId:a.assetId,name:a.name,status:a.status,type:a.type,createdAt:a.createdAt,updatedAt:a.updatedAt}))}));
  if(!r.ok||!j?.isSuccess||!j?.pagination||page>=j.pagination.totalPages)break;
 }
 process.exit(0);
})().catch(()=>{console.error('Read-only asset audit failed; no credentials printed.');process.exit(1)});
