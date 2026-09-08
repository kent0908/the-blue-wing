const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
let authThrows=false,apiThrows=false;
class ProviderAssetError extends Error {constructor(message,status=400,code='asset_invalid'){super(message);Object.assign(this,{status,code});}}
const api={ProviderAssetError};for(const key of ['listProviderAssets','createProviderAsset','refreshProviderAsset','renameProviderAsset','deleteProviderAsset'])api[key]=async()=>{if(apiThrows)throw Error('private details must never leak');return{assets:[]};};
function load(file){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='@/lib/apiauth'?{requireUser:async()=>{if(authThrows)throw Error('session driver unexpected failure');return{user:{id:7}};}}:id==='@/lib/providerAssets'?api:require(id),m,m.exports);return m.exports;}
const routes=[load('app/api/provider-assets/route.ts'),load('app/api/provider-assets/[id]/route.ts')];
const ctx={params:Promise.resolve({id:'1'})};
const req=(method,body)=>new NextRequest('https://test.local/api/provider-assets/1',{method,...(body!==undefined?{body,headers:{'Content-Type':'application/json'}}:{})});
(async()=>{
 for(const field of ['authThrows','apiThrows']){
  authThrows=field==='authThrows';apiThrows=field==='apiThrows';
  for(const route of routes)for(const method of ['GET','POST','PATCH','DELETE'].filter(m=>route[m])){
   const r=await route[method](req(method,['POST','PATCH'].includes(method)?'{}':undefined),ctx);assert.equal(r.status,503);assert.ok(r.headers.get('content-type').includes('application/json'));const body=await r.text();assert.ok(!body.includes('private details')&&!body.includes('session driver'));
  }
 }
 authThrows=apiThrows=false;for(const [route,method]of[[routes[0],'POST'],[routes[1],'PATCH']]){const r=await route[method](req(method,'<!DOCTYPE html>'),ctx);assert.equal(r.status,400);assert.equal((await r.json()).error.code,'asset_invalid');}
 console.log('PASS provider route errors stay JSON for auth/data exceptions and malformed request bodies; no live calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
