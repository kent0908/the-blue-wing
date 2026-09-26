const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(f){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Set,Number,Object,Math,TextDecoder,TransformStream});return exports;}
const {publicPrice}=load('lib/sirayaPublicPrices.ts');const {simulateCost,promotionEconomics}=load('lib/costEconomics.ts');const {extractProviderReceipt}=load('lib/providerReceipt.ts');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
near(simulateCost(publicPrice('SIRAYA-Seedance-2.5').components,{'1080p-plain':1168425},0).list,13.6705725);
near(simulateCost(publicPrice('SIRAYA-Seedance-2.5').components,{'1080p-video':1168425},20).discounted,6.54318);
near(simulateCost(publicPrice('gpt-image-2').components,{textInput:1000,imageInput:1000,imageOutput:1000},0).list,.0215);
near(simulateCost(publicPrice('Dola-Seedream-5.0-pro').components,{layerSmall:3,references:2},25).discounted,.055125);
near(simulateCost(publicPrice('veo-3.1-generate-001').components,{hd:8},0).list,3.2);
near(simulateCost(publicPrice('veo-3.1-generate-001').components,{'4k':8},0).list,4.8);
near(simulateCost(publicPrice('happyhorse-1.1-t2v').components,{'1080p':5},0).list,.9);
assert.equal(simulateCost(publicPrice('gpt-image-2').components,{},0),null);
assert.equal(simulateCost(publicPrice('gpt-image-2').components,{imageOutput:-1},0),null);
assert.equal(simulateCost(publicPrice('gpt-image-2').components,{imageOutput:1},101),null);
assert.equal(simulateCost(publicPrice('gpt-image-2').components,{imageOutput:1},100).discounted,0);
const promo=promotionEconomics({paidUsd:9,baseCredits:900,bonusCredits:900,callCredits:100,costUsd:.6,feePct:0});near(promo.cashPerCredit,.005);near(promo.contribution,-.1);assert.equal(promo.breakEvenCredits,120);
const free=promotionEconomics({paidUsd:0,baseCredits:0,bonusCredits:100,callCredits:100,costUsd:.5,feePct:0});assert.equal(free.allocatedCash,0);assert.equal(free.contribution,-.5);assert.equal(free.breakEvenCredits,null);assert.equal(free.marginPct,null);
assert.equal(promotionEconomics({paidUsd:9,baseCredits:0,bonusCredits:0,callCredits:100,costUsd:.5,feePct:0}),null);
assert.equal(extractProviderReceipt({choices:[{text:'private'}]}),null);
const receipt=extractProviderReceipt({cost:0,usage:{prompt_tokens:100,prompt_tokens_details:{cached_tokens:20,secret:10},prompt:'secret',negative:-3},key:'secret'});
assert.equal(receipt.costUsd,0);assert.equal(receipt.usage['prompt_tokens_details.cached_tokens'],20);assert.ok(!JSON.stringify(receipt).includes('secret'));
assert.equal(extractProviderReceipt({cost:'0.5'}),null);assert.equal(extractProviderReceipt({cost:-1}),null);
for(const id of ['deepseek-v4-pro','deepseek-v4-flash','deepseek-v4-flash-0731'])assert.equal(publicPrice(id).verification,'pending');
assert.equal(publicPrice('NSFW-Seedance-2.5'),publicPrice('SIRAYA-Seedance-2.5'));
console.log('PASS: dimensional tariffs, discounts, token units, pure grants, bonus dilution, invalid inputs, private-data filtering');

const {observeBillingStream}=load('lib/providerReceipt.ts');
(async()=>{
 const text='data: {"choices":[{"text":"你好"}]}\n\ndata: {"cost":0.25,"usage":{"completion_tokens":25}}\n\ndata: [DONE]\n';
 const bytes=new TextEncoder().encode(text);let receipts=[];
 const source=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close()}});
 const output=await new Response(observeBillingStream(source,async r=>{receipts.push(r)})).text();
 assert.equal(output,text);assert.equal(receipts.length,1);assert.equal(receipts[0].cost,.25);
 assert.equal(simulateCost(publicPrice('veo-3.1-generate-001').components,{hd:8,'4k':8},0),null);
 console.log('PASS: fragmented SSE preserves text and captures billing once; mixed scenarios rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
