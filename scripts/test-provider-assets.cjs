const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
let rows=[],calls=0,uploadFails=false,returnedAssetId='a-test';
const source={id:9,user_id:7,content_type:'image/png',size:3,pathname:'private/9',filename:'hero.png'};
const sql={query:async(q,p)=>{
 if(q.startsWith('select * from assets'))return {rows:p[0]===7&&p[1]===9?[source]:[]};
 if(q.startsWith('insert into provider_assets')){if(rows.some(r=>r.user_id===p[0]&&r.source_asset_id===p[1]))return{rows:[]};const r={id:1,user_id:p[0],source_asset_id:p[1],name:p[2],asset_type:p[3],status:'uploading',provider_asset_id:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};rows.push(r);return{rows:[r]};}
 if(q.startsWith('select * from provider_assets'))return{rows:rows.filter(r=>r.user_id===p[0]&&(q.includes('source_asset_id')?r.source_asset_id:r.id)===p[1])};
 if(q.startsWith('update provider_assets set provider_asset_id')){const r=rows.find(r=>r.id===p[2]&&r.user_id===p[3]);Object.assign(r,{provider_asset_id:p[0],status:p[1]});return{rows:[r]};}
 if(q.startsWith('update provider_assets set status=$1')){const r=rows.find(r=>r.id===p[1]&&r.user_id===p[2]);Object.assign(r,{status:p[0]});return{rows:[r]};}
 throw Error('Unhandled test query '+q);
}};
const moduleMock={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('lib/providerAssets.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='./db'?{sql}:id==='@vercel/blob'?{get:async()=>({statusCode:200,stream:new Blob(['abc']).stream()})}:require(id),moduleMock,moduleMock.exports);
const api=moduleMock.exports;process.env.SIRAYA_ASSET_API_KEY='mock-only';
global.fetch=async(url,init)=>{calls++;assert.equal(init.headers.Authorization,'Bearer mock-only');assert.ok(url.startsWith('https://console-api.siraya.ai/extapi/v1/assets'));if(uploadFails)throw Error('timeout');if(init.method==='POST'){assert.equal(init.body.get('assetType'),'image');assert.equal(init.body.get('file').size,3);return Response.json({isSuccess:true,data:{assetId:returnedAssetId,status:'processing'}});}return Response.json({isSuccess:true,data:{assetId:returnedAssetId,type:'image',status:'active'}});};
(async()=>{
 await assert.rejects(()=>api.createProviderAsset(7,9,false),/授權/);assert.equal(calls,0);
 await assert.rejects(()=>api.createProviderAsset(8,9,true),/找不到/);assert.equal(calls,0);
 const first=await api.createProviderAsset(7,9,true);assert.equal(first.status,'processing');assert.equal('provider_asset_id' in first,false);
 await Promise.all([api.createProviderAsset(7,9,true),api.createProviderAsset(7,9,true)]);assert.equal(calls,1);
 await assert.rejects(()=>api.resolveProviderAssetReferences(8,[1]),/找不到/);assert.equal(calls,1);
 const refs=await api.resolveProviderAssetReferences(7,[1]);assert.deepEqual(refs,[{type:'image',url:'asset://a-test',role:'reference_image'}]);
 await assert.rejects(()=>api.resolveProviderAssetReferences(7,[1,1]),/重複/);
 rows=[];returnedAssetId='asset-20260908173741-v76p5';const actual=await api.createProviderAsset(7,9,true);assert.equal(actual.status,'processing');assert.equal(rows[0].provider_asset_id,returnedAssetId);assert.equal((await api.resolveProviderAssetReferences(7,[1]))[0].url,'asset://'+returnedAssetId);
 rows=[];uploadFails=true;await assert.rejects(()=>api.createProviderAsset(7,9,true),e=>e.code==='asset_connection_failed');assert.equal(rows[0].status,'needs_review');const count=calls;await api.createProviderAsset(7,9,true);assert.equal(calls,count);
 await assert.rejects(()=>api.deleteProviderAsset(7,1),/尚未確認/);
 rows=[];global.fetch=async()=>new Response('<!DOCTYPE html><title>Gateway error</title>',{status:502,headers:{'content-type':'text/html'}});
 await assert.rejects(()=>api.createProviderAsset(7,9,true),e=>e.code==='asset_invalid_response'&&!e.message.includes('<'));assert.equal(rows[0].status,'needs_review');
 console.log('PASS provider assets: consent, ownership, upload contract, retry deduplication, active references, uncertain-result protection; no live calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
