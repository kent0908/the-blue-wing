require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
const expected=[{id:1,source:29,provider:'asset-20260908173731-rm5kl'},{id:2,source:26,provider:'asset-20260908173741-v76p5'}];
(async()=>{
 const key=process.env.SIRAYA_ASSET_API_KEY||process.env.SIRAYA_API_KEY;if(!key)throw Error('not configured');
 // Read numeric pages only: no local names or identifiers are transmitted.
 const response=await fetch('https://console-api.siraya.ai/extapi/v1/assets?page=1&pageSize=100',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
 const j=await response.json();if(!response.ok||j.isSuccess!==true||!Array.isArray(j.data?.items))throw Error('upstream validation failed');
 const client=await sql.connect();
 try {
  await client.query('BEGIN');let repaired=0;
  for(const item of expected){
   const {rows}=await client.query("select p.* from provider_assets p join assets a on a.id=p.source_asset_id and a.user_id=p.user_id where p.id=$1 and p.source_asset_id=$2 for update of p",[item.id,item.source]);
   const row=rows[0];if(!row)throw Error('missing owned mapping');
   const remote=j.data.items.find(a=>a.assetId===item.provider);
   if(!remote||remote.status!=='active'||remote.type!=='image'||remote.name!==row.name||Math.abs(new Date(remote.createdAt)-new Date(row.created_at))>60000)throw Error('exact match failed');
   if(row.status==='active'&&row.provider_asset_id===item.provider)continue;
   if(row.status!=='needs_review'||row.provider_asset_id!==null)throw Error('unexpected local status');
   const result=await client.query("update provider_assets set provider_asset_id=$1,status='active',updated_at=now() where id=$2 and user_id=$3 and source_asset_id=$4 and provider_asset_id is null and status='needs_review'",[item.provider,item.id,row.user_id,item.source]);
   if(result.rowCount!==1)throw Error('guard mismatch');repaired++;
  }
  await client.query('COMMIT');console.log(JSON.stringify({repaired,uploads:0,generations:0,credits:0}));
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 process.exit(0);
})().catch(()=>{console.error('Guarded asset mapping repair failed; no credentials or rows printed.');process.exit(1)});
