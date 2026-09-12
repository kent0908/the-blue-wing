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
const crm=load('lib/crm.ts',{'./db':{sql},'./rateCard':{getRate:async()=>({modality:'image',credits:60})},'./sirayaPublicPrices':prices});
(async()=>{
 let q=await crm.quoteCost('ByteDance-Seedream-4.0',120,{units:2});
 assert.equal(q.listCostUsd,.06);assert.equal(q.actualCostUsd,.054);assert.equal(q.costKnown,true);
 discount=25;q=await crm.quoteCost('ByteDance-Seedream-4.0',120,{units:2});assert.equal(q.actualCostUsd,.045);
 discount=100;q=await crm.quoteCost('ByteDance-Seedream-4.0',120,{units:2});assert.equal(q.actualCostUsd,0);assert.equal(q.costKnown,true);
 for(const model of ['gpt-image-2','Seedance-2.0-mini','NSFW-Seedream-4.0','missing','Dola-Seedream-5.0-pro'])assert.equal((await crm.quoteCost(model,120,{units:2})).costKnown,false,model);
 assert.equal((await crm.quoteCost('ByteDance-Seedream-4.0',120)).costKnown,false);
 assert.equal(prices.publicPrice('Seedance-2.0-mini').price,2.1);
 assert.equal(prices.publicPrice('SIRAYA-Seedance-2.0-mini').price,2.1);
 assert.equal(prices.publicPrice('NSFW-Seedance-2.0-mini'),undefined);
 assert.equal(prices.publicPrice('gpt-image-2').inputPrice,5);
 let user=null;
 const guard=load('lib/apiauth.ts',{'./rateLimit':{limitRequest:async()=>true},'next/server':require('next/server'),'./auth':{getSessionUser:async()=>user},'./crm':{touchActivity:async()=>{}}});
 const request=new(require('next/server').NextRequest)('https://example.test/api/crm/costs');
 assert.equal((await guard.requireAdmin(request)).error.status,401);
 user={id:1,role:'user',email_verified:true};assert.equal((await guard.requireAdmin(request)).error.status,403);
 user={id:1,role:'admin',email_verified:false};assert.equal((await guard.requireAdmin(request)).error.status,403);
 user={id:1,role:'admin',email_verified:true};assert.equal((await guard.requireAdmin(request)).user.role,'admin');
 console.log('PASS: vendor units, missing receipts, global/model/100% discounts, anonymous/user/unverified/admin access');
})().catch(e=>{console.error(e);process.exitCode=1});
