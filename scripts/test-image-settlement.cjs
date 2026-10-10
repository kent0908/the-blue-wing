/** Exercise real routes and ledger helpers. No network or production DB. */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={}) { const m={exports:{}}; new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports); return m.exports; }
class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
const context=load('lib/billingContext.ts'),replay=load('lib/creditReplay.ts').replayCredits;
let ledger,events,snapshot,outputs,records,providerCalls,stored,concurrentSpend,failStore,failRecord,failSettle;
const balance=()=>replay(ledger);
function reset(data=[{url:'https://fixture.test/image.png'}]) {
  ledger=[{id:'1',user_id:1,delta:1000,reason:'grant',ref:null,created_at:new Date().toISOString(),expires_at:null}];
  events=[];outputs=data;records=[];providerCalls=0;stored=[];concurrentSpend=0;failStore=false;failRecord=false;failSettle=false;
}
const query=async(q,p=[])=>{
  if(q==='BEGIN'){snapshot={ledger:structuredClone(ledger),events:structuredClone(events)};return {rows:[]};}
  if(q==='ROLLBACK'){ledger=snapshot.ledger;events=snapshot.events;return {rows:[]};}
  if(q==='COMMIT'||q.startsWith('SELECT id FROM users'))return {rows:[]};
  if(q.startsWith('SELECT id,delta'))return {rows:ledger};
  if(q.startsWith('SELECT * FROM credit_ledger')||q.startsWith('SELECT delta FROM credit_ledger'))return {rows:ledger.filter(l=>l.id===p[0]&&l.user_id===p[1]&&l.delta<0)};
  if(q.startsWith('SELECT 1 FROM credit_ledger'))return {rows:ledger.filter(l=>l.user_id===p[0]&&l.reason==='charge_refund'&&l.ref===p[1])};
  if(q.startsWith('SELECT COALESCE'))return {rows:[{total:ledger.filter(l=>l.user_id===p[0]&&l.ref===p[1]&&(q.includes('reason IN')?['charge_refund','charge_partial_refund'].includes(l.reason):l.reason==='charge_partial_refund')).reduce((n,l)=>n+l.delta,0)}]};
  if(q.startsWith('INSERT INTO credit_ledger')) {
    const reason=q.includes("'charge_partial_refund'")?'charge_partial_refund':q.includes("'charge_refund'")?'charge_refund':p[2];
    const id=String(ledger.length+1);ledger.push({id,user_id:p[0],delta:p[1],reason,ref:reason.startsWith('charge_')?p[2]:p[3],created_at:new Date().toISOString(),expires_at:null});return {rows:[{id}]};
  }
  if(q.startsWith('UPDATE usage_events')) {if(failSettle)throw Error('settlement write failed');for(const e of events)if(e.chargeId===p[1]&&e.userId===p[2]&&e.status==='charged')e.credits=p[0];return {rows:[]};}
  throw Error('Unexpected SQL '+q);
};
const tx=load('lib/creditTransactions.ts',{'./videoConcurrency':{MAX_CONCURRENT_VIDEO_JOBS:4,countInFlightVideoJobs:async()=>0},'./billingContext':context,'./creditReplay':{replayCredits:replay},'./db':{sql:{connect:async()=>({query,release(){}}),query}},'./siraya':{SirayaApiError:ApiError},'./alerts':{alertGenerationFailure(){}},'./crm':{
  quoteCost:async()=>({unitCostUsd:1.25}),recordUsageEvent:async e=>events.push({...e,status:'charged'}),markUsageRefunded:async id=>{for(const e of events)if(e.chargeId===id)e.status='refunded';}
}});
const provider=async()=>{providerCalls++;if(concurrentSpend){ledger.push({id:'concurrent',user_id:1,delta:-concurrentSpend,reason:'text',ref:'other-model',created_at:new Date().toISOString(),expires_at:null});}return {data:outputs,cost:1.25,usage:{image_count:Array.isArray(outputs)?outputs.length:0}};};
const mocks={
  '@/lib/resolveGenerationImage':{resolveGenerationImage:async(u,v)=>v},'@/lib/referenceImage':{normalizeReferenceDataUrl:async v=>v,normalizeReferenceDataUrlDetailed:async v=>({value:v,changed:false})},
  '@/lib/layerCapability':{LAYER_DECOMPOSITION_AVAILABLE:false},'@/lib/layerDecomposition':{},'@/lib/layerSets':{},'@/lib/companionGenerationAccess':{assertModelAccess(){}},'@/lib/generationValidation':{validateGeneration(){}},
  '@/lib/creditTransactions':tx,'@/lib/siraya':{SirayaApiError:ApiError,createImage:provider,createImageEdit:provider},'next/server':{NextRequest,NextResponse},
  '@/lib/errors':{errorResponse:e=>NextResponse.json({error:{message:e.message}},{status:e.status??500})},'@/lib/apiauth':{requireUser:async()=>({user:{id:1}})},'@/lib/credits':{creditCost:async i=>8*(i.imageCount??1),getBalance:async()=>balance()},
  '@/lib/assetData':{assetsToDataUrls:async()=>[]},'@/lib/imageModels':{MAX_REF_IMAGES:10},'@/lib/watermark':{applyWatermarkDefaults:v=>v},'@/lib/imageMime':{sniffImageMimeFromBase64:()=> 'image/png'},
  '@/lib/mediaStore':{persistGeneratedMedia:async v=>{if(failStore)throw Error('storage unavailable');stored.push(v);return '/api/media/fixture/'+stored.length;}},
  '@/lib/generations':{recordGeneration:async(u,g)=>{if(failRecord)throw Error('history unavailable');records.push(g);}}
};
const images=load('app/api/images/route.ts',mocks),edit=load('app/api/images/edit/route.ts',mocks);
const request=(route,n=1,headers={})=>route.POST(new NextRequest('https://fixture.test/api/images',{method:'POST',headers,body:JSON.stringify({model:'fixture-model',prompt:'fixture',image:'data:image/png;base64,fixture',n})}));
let checks=0;async function test(name,run){reset();await run();checks++;console.log('PASS '+name);}
(async()=>{
  await test('partial batch charges only delivered images and returns fresh concurrent balance',async()=>{
    outputs=[{url:'https://fixture.test/one.png'},null,{url:23},{b64_json:'fixture-base64'}];concurrentSpend=50;
    const r=await request(images,4),j=await r.json();assert.equal(r.status,200);assert.equal(j.requestedCount,4);assert.equal(j.deliveredCount,2);assert.equal(j.creditsSpent,16);assert.equal(j.creditsRefunded,16);assert.equal(j.creditsBalance,934);assert.equal(balance(),934);assert.equal(events[0].credits,16);assert.equal(events[0].providerResponse.cost,1.25);assert.equal(events[0].units,4);assert.equal(records.length,2);
  });
  for(const [name,data] of [['empty',[]],['missing',undefined],['malformed array',{url:'https://fixture.test/no.png'}],['invalid entries',[null,3,{url:45},{b64_json:42},{url:'   '}]]])await test(name+' provider result fails and fully refunds',async()=>{outputs=data;const r=await request(images,4);assert.equal(r.status,502);assert.equal(balance(),1000);assert.equal(events[0].status,'refunded');assert.equal(records.length,0);});
  await test('overdelivery does not add unrequested images',async()=>{outputs=Array.from({length:3},(_,i)=>({url:'https://fixture.test/'+i+'.png'}));const j=await (await request(images)).json();assert.equal(j.images.length,1);assert.equal(stored.length,1);assert.equal(j.creditsSpent,8);assert.equal(balance(),992);});
  for(const name of ['storage','history','settlement'])await test(name+' failure refunds reservation',async()=>{outputs=[{url:'https://fixture.test/one.png'}];failStore=name==='storage';failRecord=name==='history';failSettle=name==='settlement';const r=await request(images,4);assert.equal(r.status,500);assert.equal(balance(),1000);assert.equal(events[0].status,'refunded');});
  await test('partial and full refunds are idempotent and retain vendor costs',async()=>{outputs=[{url:'https://fixture.test/one.png'}];await request(images,4);const id=events[0].chargeId;assert.equal(await tx.settleCharge(1,id,8),0);assert.equal(await tx.settleCharge(1,id,16),0);assert.equal(events[0].credits,8);await tx.refundCharge(1,id);await tx.refundCharge(1,id);assert.equal(balance(),1000);assert.equal(events[0].providerResponse.cost,1.25);assert.equal(ledger.filter(l=>l.reason==='charge_refund').length,1);assert.equal(ledger.find(l=>l.reason==='charge_refund').delta,8);});
  await test('settlement inside paid callback records net usage',async()=>{const {result}=await tx.paidCall(1,32,'image_layers','fixture',async id=>{await tx.settleCharge(1,id,16);return {creditsSpent:16,cost:1.25};},{chargedCredits:r=>r.creditsSpent});assert.equal(result.creditsSpent,16);assert.equal(events[0].credits,16);assert.equal(balance(),984);});
  await test('invalid trusted settlement refunds and records no successful usage',async()=>{await assert.rejects(tx.paidCall(1,8,'image','fixture',async()=>({spent:9}),{chargedCredits:r=>r.spent}));assert.equal(balance(),1000);assert.equal(events.length,0);});
  await test('ordinary provider cannot self-declare zero charge',async()=>{await tx.paidCall(1,8,'image','fixture',async()=>({creditsSpent:0}));assert.equal(events[0].credits,8);assert.equal(balance(),992);});
  await test('stale edit quote rejects before provider and charging',async()=>{const r=await request(edit,1,{'x-blue-wing-expected-credits':'7'});assert.equal(r.status,409);assert.equal(providerCalls,0);assert.equal(balance(),1000);});
  await test('image edit returns current balance after concurrent spend',async()=>{concurrentSpend=50;const j=await (await request(edit)).json();assert.equal(j.creditsSpent,8);assert.equal(j.creditsBalance,942);});
  await test('invalid image edit data refunds',async()=>{outputs=[{url:{unexpected:true}}];const r=await request(edit);assert.equal(r.status,502);assert.equal(balance(),1000);});
  console.log(`Image settlement: ${checks} cases passed; mocked provider and transactional ledger, no paid calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
