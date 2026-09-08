const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const m={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('lib/providerAssetResponse.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
const {readProviderAssetResponse:read,providerAssetPage:page}=m.exports;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
await test('HTML failure does not expose parser internals or response body',async()=>{await assert.rejects(read(new Response('<html>private server details</html>',{status:502})),e=>!e.message.includes('private')&&!e.message.includes('JSON')&&e.message.includes('載入'));});
await test('empty mutation timeout warns against duplicate registration',async()=>{await assert.rejects(read(new Response('',{status:504}),true),/避免重複登錄/);});
await test('non-JSON unauthorized response requests login',async()=>{await assert.rejects(read(new Response('Unauthorized',{status:401})),/重新登入/);});
await test('feature inactive code replaces upstream details',async()=>{await assert.rejects(read(Response.json({error:{code:'asset_feature_inactive',message:'provider internal diagnostic'}},{status:503})),e=>e.message.includes('尚未啟用')&&!e.message.includes('provider'));});
await test('uncertain code preserves do-not-repeat guidance',async()=>{await assert.rejects(read(Response.json({error:{code:'asset_upload_uncertain'}},{status:502}),true),/請勿重複上傳/);});
await test('structured input validation remains useful',async()=>{await assert.rejects(read(Response.json({error:{code:'asset_invalid',message:'素材超過 32 MB 上限'}},{status:400})),/32 MB/);});
await test('204 deletion succeeds with no parsing',async()=>assert.deepEqual(await read(new Response(null,{status:204}),true),{}));
await test('successful HTML or non-object payload rejected',async()=>{for(const body of ['<html>login</html>','null','[]'])await assert.rejects(read(new Response(body)));});
await test('valid and empty pages render without pagination zero',async()=>{assert.deepEqual(page(await read(Response.json({assets:[],pagination:{totalPages:0}}))),{assets:[],totalPages:1});const asset={id:1,sourceAssetId:2,name:'Reference',assetType:'image',status:'active',src:'/api/assets/2/raw'};assert.deepEqual(page({assets:[asset],pagination:{totalPages:2}}),{assets:[asset],totalPages:2});});
await test('malformed list structures never enter React rendering',()=>{for(const payload of [{},{assets:null,pagination:{}},{assets:[{}],pagination:{totalPages:1}},{assets:[],pagination:{totalPages:-1}},{assets:[],pagination:{totalPages:'1'}}])assert.throws(()=>page(payload),/回應不完整/);});
console.log(`Provider asset response: ${passed} passed; no network or uploads.`);
})().catch(e=>{console.error(e);process.exitCode=1});
