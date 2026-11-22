/* Exercise the actual admin route. All account, storage and provider I/O is local. */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),ts=require("typescript");
const root=path.resolve(__dirname,"..");
class BusinessError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const json=(body,status=200)=>Response.json(body,{status,headers:{"cache-control":"private,no-store"}});
let authorized,approved,configured,credentialPresent,providerError,originalError,calls;
const secret="sk-fixture-customer-owned-1234567890";
function reset(){authorized=approved=configured=credentialPresent=true;providerError=originalError=null;calls=[];}
const mocks={
 "@/lib/apiauth":{requireAdmin:async()=>authorized?{user:{id:1}}:{error:json({error:{code:"forbidden"}},403)}},
 "@/lib/business":{BusinessError,businessJson:json,businessNoStore:r=>r,
   businessErrorResponse:(_req,e)=>json({error:{code:e instanceof BusinessError?e.code:"unavailable"}},e.status??503),
   getBusinessAccount:async id=>{calls.push(["account",id]);return{id:"owned-account",status:approved?"approved":"suspended"};},
   getBusinessCredentialMetadata:async(uid,aid)=>{calls.push(["metadata",uid,aid]);return{id:"current-version",last4:"7890"};},
   getBusinessCredential:async(uid,aid)=>{calls.push(["credential",uid,aid]);return credentialPresent?{id:"current-version",apiKey:secret}:null;}},
 "@/lib/businessAssetUploads":{businessDirectUploadReady:()=>configured,listBusinessUploads:async(uid,aid)=>{calls.push(["originals",uid,aid]);if(originalError)throw originalError;return[{name:"PRIVATE NAME"}];}},
 "@/lib/businessProviderAssets":{listBusinessProviderAssets:async(options,credential)=>{calls.push(["provider",options,credential.apiKey]);assert.equal(credential.apiKey,secret);assert.equal(options.pageSize,1);if(providerError)throw providerError;return{assets:[{name:"PRIVATE NAME",url:"https://signed.invalid/SECRET"}]};}}
};
const fixture={exports:{}};
const source=ts.transpileModule(fs.readFileSync(path.join(root,"app/api/admin/business/asset-diagnostics/route.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function("require","module","exports",source)(id=>{assert.ok(Object.hasOwn(mocks,id),"Unexpected import "+id);return mocks[id];},fixture,fixture.exports);
const get=query=>fixture.exports.GET({nextUrl:new URL("https://fixture.invalid/api/admin/business/asset-diagnostics"+query)});
(async()=>{
 reset();authorized=false;assert.equal((await get("?userId=138")).status,403);assert.equal(calls.length,0);
 reset();for(const q of["","?userId=01","?userId=138&userId=139","?userId=138&key=SECRET","?userId=9007199254740992"]){assert.equal((await get(q)).status,400);}assert.equal(calls.length,0);
 reset();approved=false;assert.equal((await get("?userId=138")).status,403);assert.deepEqual(calls,[["account",138]]);
 reset();const ok=await get("?userId=138");assert.match(ok.headers.get("cache-control"),/no-store/);const b=await ok.json();assert.equal(b.storage.configured,true);assert.equal(b.originals.available,true);assert.equal(b.provider.available,true);assert.equal(b.provider.keyLast4,"7890");assert.ok(!JSON.stringify(b).includes(secret));assert.ok(!JSON.stringify(b).includes("PRIVATE NAME"));assert.ok(!JSON.stringify(b).includes("signed.invalid"));assert.ok(calls.filter(x=>["metadata","credential","originals"].includes(x[0])).every(x=>x[1]===138&&x[2]==="owned-account"));
 reset();providerError=new BusinessError("business_asset_feature_inactive",403);const p=await(await get("?userId=138")).json();assert.equal(p.provider.code,"business_asset_feature_inactive");assert.equal(p.provider.httpStatus,403);assert.equal(p.originals.available,true);
 reset();providerError=new Error(secret);originalError=new Error("PRIVATE SQL");const failed=await(await get("?userId=138")).json();assert.equal(failed.provider.code,"unavailable");assert.equal(failed.originals.code,"unavailable");assert.ok(!JSON.stringify(failed).includes(secret));assert.ok(!JSON.stringify(failed).includes("PRIVATE SQL"));
 reset();configured=false;const storage=await(await get("?userId=138")).json();assert.equal(storage.storage.configured,false);assert.equal(storage.provider.available,true);
 reset();credentialPresent=false;const missing=await(await get("?userId=138")).json();assert.equal(missing.provider.code,"credential_required");assert.ok(!calls.some(x=>x[0]==="provider"));
 assert.equal(fixture.exports.POST,undefined);assert.equal(fixture.exports.DELETE,undefined);
 console.log("PASS admin asset diagnostics: admin guard, canonical IDs, approval, exact customer key, stage isolation, no-store, no secrets/media, GET only");
})().catch(e=>{console.error(e);process.exitCode=1;});
