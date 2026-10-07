const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
 const exports = {};
 const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require:id=>id in mocks?mocks[id]:require(id),console,Map,Date});
 return exports;
}
const prices=load('lib/sirayaPublicPrices.ts');
let discount=null;
const sql=async strings=>({rows:strings.join('').includes('crm_settings')?[{key:'default_discount_pct',value:10}]:[{discount_pct:discount}]});
const crm=load('lib/crm.ts',{'./db':{sql},'./rateCard':{getRate:async()=>({modality:'image',credits:60})},'./sirayaPublicPrices':prices,'./providerReceipt':load('lib/providerReceipt.ts')});
(async()=>{
 let q=await crm.quoteCost('ByteDance-Seedream-4.0',120,{units:2});
 assert.equal(q.listCostUsd,.06);assert.equal(q.actualCostUsd,.054);assert.equal(q.costKnown,true);
 discount=25;q=await crm.quoteCost('ByteDance-Seedream-4.0',120,{units:2});assert.equal(q.actualCostUsd,.045);
 discount=100;q=await crm.quoteCost('ByteDance-Seedream-4.0',120,{units:2});assert.equal(q.actualCostUsd,0);assert.equal(q.costKnown,true);
 for(const model of ['gpt-image-2','Seedance-2.0-mini','missing','Dola-Seedream-5.0-pro'])assert.equal((await crm.quoteCost(model,120,{units:2})).costKnown,false,model);
 assert.equal((await crm.quoteCost('ByteDance-Seedream-4.0',120)).costKnown,false);
 assert.equal(prices.publicPrice('Seedance-2.0-mini').price,2.1);
 assert.equal(prices.publicPrice('SIRAYA-Seedance-2.0-mini').price,2.1);
 assert.equal(prices.publicPrice('NSFW-Seedance-2.0-mini'),prices.publicPrice('SIRAYA-Seedance-2.0-mini'));
 for(const [nsfw,standard] of [['NSFW-Seedream-4.0','ByteDance-Seedream-4.0'],['NSFW-Seedream-4.5','ByteDance-Seedream-4.5'],['NSFW-Seedream-5.0-lite','Dola-Seedream-5.0-lite'],['NSFW-Dola-Seedream-5.0-pro','Dola-Seedream-5.0-pro']])assert.equal(prices.publicPrice(nsfw),prices.publicPrice(standard));
 assert.equal(prices.publicPrice('Dola-Seedream-5.0-lite').price,.035);
 assert.equal((await crm.quoteCost('NSFW-Seedream-4.0',60,{units:1})).costKnown,true);
 assert.equal(prices.publicPrice('gpt-image-2').inputPrice,2.5);
 discount=25;
 for(const [model,tiers] of Object.entries({'wan3.0-video':[.05,.1,.2],'wan3.0-video-prime':[.068,.14,.28]})) {
  for(const [i,resolution] of ['480p','720p','1080p'].entries()) {
   const q=await crm.quoteCost(model,999,{units:2,resolution});
   assert.equal(q.costKnown,true);assert.equal(q.listCostUsd,Math.round(tiers[i]*2*1e6)/1e6);assert.equal(q.actualCostUsd,Math.round(tiers[i]*2*.75*1e6)/1e6);
  }
  assert.equal((await crm.quoteCost(model,999,{units:2})).costKnown,false);
 }
 let user=null;
 const guard=load('lib/apiauth.ts',{'./rateLimit':{limitRequest:async()=>true},'next/server':require('next/server'),'./auth':{getSessionUser:async()=>user},'./crm':{touchActivity:async()=>{}},'./adultGate':{isAdultVerified:()=>true}});
 const request=new(require('next/server').NextRequest)('https://example.test/api/crm/costs');
 assert.equal((await guard.requireAdmin(request)).error.status,401);
 user={id:1,role:'user',email_verified:true};assert.equal((await guard.requireAdmin(request)).error.status,403);
 user={id:1,role:'admin',email_verified:false};assert.equal((await guard.requireAdmin(request)).error.status,403);
 user={id:1,role:'admin',email_verified:true};assert.equal((await guard.requireAdmin(request)).user.role,'admin');
 console.log('PASS: vendor units, missing receipts, global/model/100% discounts, anonymous/user/unverified/admin access');
})().catch(e=>{console.error(e);process.exitCode=1});
