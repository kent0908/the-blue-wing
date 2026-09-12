const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:id=>mocks[id],Date,Map});return exports;}
const range=load('lib/crmRange.ts');
const p=range.reportRange(30,'2026-09-06','2026-09-06');assert.equal(p.since,'2026-09-05T16:00:00.000Z');assert.equal(p.until,'2026-09-06T16:00:00.000Z');assert.equal(p.dates.length,1);
assert.equal(range.reportRange(1,undefined,undefined,new Date('2026-09-05T17:00:00Z')).from,'2026-09-06');
assert.equal(range.reportRange(30,'2024-02-28','2024-03-01').dates.length,3);
for(const [a,b]of[['2026-02-30','2026-03-01'],['2026-09-07','2026-09-06'],['2024-01-01','2026-01-01'],['2026-09-06',undefined]])assert.throws(()=>range.reportRange(30,a,b));
let n=0;const responses=[[{}],[{}],[],[],[{date:p.from,spent:120,admin_spent:100}],[],[{date:p.from,cost:2,list_cost:2,known:true,credits:20}],[{date:p.from,refunded:100,admin_refunded:100}],[]];
const reports=load('lib/crmReports.ts',{'./db':{sql:async()=>({rows:responses[n++]})},'./crm':{getSettings:async()=>({credit_value_usd:.01}),listModelCosts:async()=>[]},'./creditPacks':{CREDIT_PACKS:[]},'./plans':{PLANS:[]},'./rateCard':{listRates:async()=>[]},'./crmRange':range,'./sirayaPublicPrices':{publicPrice:()=>null}});
(async()=>{let r=await reports.overview(30,p);assert.equal(r.totals.customerCreditsSpent,20);assert.equal(r.totals.revenueEstUsd,.2);assert.equal(r.totals.costUsd,2);assert.equal(r.totals.profitUsd,-1.8);
n=0;responses[4]=[{date:p.from,spent:100,admin_spent:100}];responses[6]=[{date:p.from,cost:2,list_cost:2,known:true,credits:100}];responses[7]=[];r=await reports.overview(30,p);assert.equal(r.totals.revenueEstUsd,0);assert.equal(r.totals.costUsd,2);assert.equal(r.totals.adminCreditsSpent,100);
n=0;responses[4]=[{date:p.from,spent:20,admin_spent:0}];responses[7]=[{date:p.from,refunded:100,admin_refunded:100}];r=await reports.overview(30,p);assert.equal(r.totals.customerCreditsSpent,20);assert.equal(r.totals.adminCreditsSpent,-100);assert.equal(r.totals.costUsd,null);
console.log('PASS Taiwan ranges, invalid dates, administrator cost-only, mixed refunds, unknown costs');})().catch(e=>{console.error(e);process.exitCode=1});
