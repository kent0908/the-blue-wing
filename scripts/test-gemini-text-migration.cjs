const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), ts=require('typescript'), assert=require('node:assert/strict');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:id=>mocks[id]??require(id),console,process}); return exports;
}
const migration=load('lib/geminiTextModels.ts');
const picker=load('lib/generationPickerModels.ts');
for(const id of ['gemini-embedding-2','qwen3-asr-flash','gemini-3.8-flash-tts','NSFW-gemini-2.5-flash-tts'])assert.equal(picker.isGenerationPickerModel(id),false);
for(const id of ['gemini-3.8-flash','gemini-2.5-flash-image','SIRAYA-Seedance-2.5','wan3.0-video'])assert.equal(picker.isGenerationPickerModel(id),true);
const formula=load('lib/creditFormula.ts');
const pricing=load('lib/pricing.ts',{'./billingModel':load('lib/billingModel.ts'),'./creditFormula':formula});
const tariffs=load('lib/sirayaPublicPrices.ts');
for (const [id,base] of [['gemini-3.1-pro-preview',4],['gemini-3.5-flash-lite',1]]) {
  const rate=pricing.rateFor(id), tariff=tariffs.publicPrice(id);
  assert.equal(rate.inputPerMTok,tariff.inputPrice);assert.equal(rate.outputPerMTok,tariff.price);
  assert.equal(tariff.checkedAt,'2026-10-09');assert.equal(tariff.source,'https://llm-ext-api.siraya.ai/api/v1/models');
  const plannedCost=(1500*rate.inputPerMTok+500*rate.outputPerMTok)/1e6;
  assert.ok(formula.creditCostFromRate({modality:'text',credits:base,maxTokens:1024})*.01/plannedCost>=4);
}
const pairs=Object.entries(migration.GEMINI_TEXT_REPLACEMENTS);
for (const [oldId,newId] of pairs) assert.equal(migration.currentGeminiTextModel(oldId.toUpperCase()),newId);
for (const id of ['gemini-2.5-flash-image','gemini-2.5-flash-tts','gemini-3.1-flash-lite-image','nano-banana','toString','__proto__']) {
  assert.equal(migration.currentGeminiTextModel(id),id); assert.equal(migration.replacementGeminiTextModel(id),undefined);
}
let calls=[];
const mockSiraya={listModels:async()=>({data:[...pairs.flat(), 'gemini-2.5-flash-image','gemini-2.5-flash-tts','gemini-embedding-2','qwen3-asr-flash'].map(id=>({id,owned_by:'google'}))}),
  createChatCompletion:async body=>{calls.push(body);return {choices:[{message:{content:'fixture reply'}}]};}};
const common={'next/server':{NextRequest,NextResponse},'@/lib/generationPickerModels':picker,'@/lib/geminiTextModels':migration,'@/lib/siraya':mockSiraya,
  '@/lib/errors':{errorResponse:e=>NextResponse.json({error:e.message},{status:500})}};
const catalog=load('app/api/models/route.ts',{...common,'@/lib/pricing':{modalityOf:()=> 'text'},'@/lib/imageModels':{getImageModel:()=>undefined},
  '@/lib/modelDisplay':{listModelDisplayOverrides:async()=>new Map(),resolveModelDisplay:id=>({displayName:id,sortOrder:0}),sortByDisplay:x=>x}});
const support=load('app/api/support-chat/route.ts',{...common,'@/lib/apiauth':{requireUser:async()=>({user:{id:7}})},
  '@/lib/rateLimit':{limitRequest:async()=>true},'@/lib/supportFaq':{faqAsPlainText:()=> 'fixture FAQ'}});
(async()=>{
  const res=await catalog.GET(); assert.equal(res.status,200); const {models}=await res.json();
  for(const [oldId,newId] of pairs) {assert.ok(!models.some(m=>m.id===oldId));assert.ok(models.some(m=>m.id===newId));}
  assert.ok(models.some(m=>m.id==='gemini-2.5-flash-image'));
  for(const id of ['gemini-2.5-flash-tts','gemini-embedding-2','qwen3-asr-flash'])assert.ok(!models.some(m=>m.id===id));
  const reply=await support.POST(new NextRequest('https://fixture.test/api/support-chat',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'How do I create?'}]})}));
  assert.equal(reply.status,200);assert.equal(calls[0].model,'gemini-3.5-flash-lite');assert.equal(calls[0].max_tokens,512);
  const invalid=await support.POST(new NextRequest('https://fixture.test/api/support-chat',{method:'POST',body:'{"messages":[]}'}));
  assert.equal(invalid.status,400);assert.equal(calls.length,1);
  const source=fs.readFileSync('scripts/migrate-gemini-text.cjs','utf8');
  for(const table of ['generations','usage_events','model_request_events','siraya_billing_records','model_costs']) assert.ok(!new RegExp('(?:update|delete from)\\s+'+table,'i').test(source));
  assert.ok(source.includes('on conflict (model_id) do nothing'));
  const composer=fs.readFileSync(path.join('components','Composer.tsx'),'utf8');assert.ok(composer.includes('currentGeminiTextModel(initialModel)'));
  console.log('PASS exact replacements, case-insensitive links, image/TTS preservation, public catalogue, support provider request, no historical repricing');
})().catch(e=>{console.error(e);process.exitCode=1});
