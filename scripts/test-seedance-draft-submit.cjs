/** Execute the actual draft submit route and validation. In-memory reservations only; no provider/database calls. */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest,NextResponse}=require('next/server');
const cache=new Map();let rows,calls,charge,refund,balance,payload,error,providerResponse,storeSync,terminalRef,records;
const uuid='51c1f865-76af-4cd3-a3ce-bf07a8d2cde0';
function reset(){rows=[];calls=0;charge=0;refund=0;balance=10000;payload=null;error=null;providerResponse={id:'video_owned_draft',status:'processing'};storeSync=false;terminalRef=null;records=[];}
const sql=async(strings,...p)=>{
 const q=strings.join('?');
 if(q.startsWith('select * from seedance_drafts'))return {rows:rows.filter(r=>r.user_id===p[0]&&r.request_id===p[1])};
 if(q.startsWith('insert into seedance_drafts')){
   if(rows.some(r=>r.user_id===p[0]&&r.request_id===p[1]))return {rows:[]};
   const row={id:'reservation-'+rows.length,user_id:p[0],request_id:p[1],prompt:p[2],seconds:p[3],aspect_ratio:p[4],generate_audio:p[5],seed:p[6],status:'submitting',job_id:null};rows.push(row);return {rows:[row]};
 }
 if(q.includes('set charge_id=')){rows.find(r=>r.id===p[1]).charge_id=p[0];return {rows:[]};}
 if(q.includes('set job_id=')){const row=rows.find(r=>r.id===p[1]);row.job_id=p[0];row.status='processing';return {rows:[]};}
 if(q.includes("set status='failed'")){rows.find(r=>r.id===p[0]).status='failed';return {rows:[]};}
 if(q.includes('update credit_ledger set ref=')){terminalRef=p[0];assert.equal(p[1],'charge_fixture');assert.equal(p[2],7);return {rows:[]};}
 throw Error('Unexpected SQL fixture');
};
const mocks={
 'next/server':{NextRequest,NextResponse},'./modelMonitoring':{monitoredModelFetch:()=>{throw Error('Network forbidden');}},
 '@/lib/apiauth':{requireUser:async()=>({user:{id:7}})},'@/lib/credits':{getBalance:async()=>balance,creditCost:async()=>168},
 '@/lib/db':{sql},'@/lib/videoConcurrency':{MAX_CONCURRENT_VIDEO_JOBS:4,countInFlightVideoJobs:async()=>0},
 '@/lib/creditTransactions':{paidCall:async(u,c,k,m,fn)=>{charge+=c;balance-=c;try{return {result:await fn('charge_fixture'),chargeId:'charge_fixture'};}catch(e){refund+=c;balance+=c;throw e;}},refundCharge:async()=>{refund+=168;balance+=168;}},
 '@/lib/seedanceDraft':{publicDraft:async row=>({id:row.job_id,status:row.status}),saveDraftReceipt:async()=>{}},
 '@/lib/mediaStore':{persistGeneratedMedia:async()=>{if(storeSync)return '/api/media/generations/7/sync.mp4';throw Error('Storage forbidden');}},'@/lib/generations':{recordGeneration:async(u,g)=>{if(storeSync){records.push(g);return;}throw Error('History forbidden');}},
 '@/lib/generationAssetUrls':{createGenerationAssetUrls:async(u,ids)=>ids.map(id=>'https://owned.invalid/'+id)},
 '@/lib/providerAssets':{resolveProviderAssetReferences:async()=>[]},
};
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in mocks)return mocks[id];const local=id.startsWith('@/')?path.resolve(id.slice(2)):id.startsWith('.')?path.resolve(path.dirname(file),id):null;return local?load(local+'.ts'):require(id)},m,m.exports);return m.exports;}
const provider=load('lib/siraya.ts');
mocks['@/lib/siraya']={...provider,createVideo:async body=>{calls++;payload=body;if(error)throw error;return providerResponse;}};
const route=load('app/api/videos/route.ts');
const send=(extra={},expected='168')=>route.POST(new NextRequest('https://fixture.invalid/api/videos',{method:'POST',headers:expected===null?{}:{'x-blue-wing-expected-credits':expected},body:JSON.stringify({model:'SIRAYA-Seedance-2.5',prompt:'A blue feather crosses the sea',seconds:4,resolution:'480p',aspect_ratio:'16:9',generate_audio:false,draft:true,clientRequestId:uuid,...extra})}));
let checks=0;async function test(name,fn){reset();await fn();checks++;console.log('PASS '+name);}
(async()=>{
 await test('draft native payload is composed on server and local bookkeeping fields are stripped',async()=>{const r=await send();assert.equal(r.status,200);assert.equal(payload.extra_body.draft,true);assert.equal(payload.extra_body.watermark,false);assert.equal(payload.resolution,'480p');assert.equal(payload.generate_audio,false);assert.equal(payload.draft,undefined);assert.equal(payload.clientRequestId,undefined);assert.equal(calls,1);assert.equal(charge,168);assert.equal(rows[0].generate_audio,false);});
 await test('two same request IDs result in one reservation and one paid submission',async()=>{const r=await Promise.all([send(),send()]);assert.ok(r.every(x=>x.status===200));assert.equal(calls,1);assert.equal(rows.length,1);assert.equal(charge,168);});
 await test('existing request remains recoverable with depleted balance',async()=>{await send();balance=0;const r=await send();assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);assert.equal(calls,1);});
 await test('draft rejects invalid model/resolution/request ID before reservation or cost',async()=>{for(const extra of [{model:'SIRAYA-Seedance-2.0'},{resolution:'1080p'},{clientRequestId:'bad'},{clientRequestId:null},{draft:'true'}])assert.equal((await send(extra)).status,400);assert.equal(rows.length,0);assert.equal(charge,0);});
 await test('direct native content cannot bypass server-owned draft task',async()=>{for(const extra_body of [{draft:true},{content:[{type:'draft_task',draft_task:{id:'cgt-foreign'}}]}])assert.equal((await send({extra_body})).status,400);assert.equal(calls,0);assert.equal(charge,0);});
 await test('explicit quote required and stale quote does not reserve or bill',async()=>{for(const expected of [null,'1','168oops'])assert.equal((await send({},expected)).status,409);assert.equal(rows.length,0);assert.equal(charge,0);});
 await test('first-last frame draft stores effective adaptive ratio and uses the same mode resolver',async()=>{const r=await send({generationMode:'first-last-frame',assetIds:[1,2]});assert.equal(r.status,200);assert.equal(payload.aspect_ratio,'adaptive');assert.equal(rows[0].aspect_ratio,'adaptive');assert.equal(payload.frame_images.length,2);assert.equal(payload.extra_body.draft,true);});
 await test('provider failure refunded and same request never replays',async()=>{error=new provider.SirayaApiError(502,'unavailable');assert.equal((await send()).status,502);assert.equal(refund,168);error=null;assert.equal((await send()).status,200);assert.equal(rows[0].status,'failed');assert.equal(calls,1);});
 await test('synchronous completed video without provider ID binds a terminal ledger and matching history reference',async()=>{storeSync=true;providerResponse={data:[{url:'https://fixture.invalid/sync.mp4'}]};const r=await send({draft:false});const j=await r.json();assert.equal(r.status,200);assert.equal(j.status,'completed');assert.equal(j.id,null);assert.equal(j.url,'/api/media/generations/7/sync.mp4');assert.equal(terminalRef,'completed:sync:charge_fixture');assert.equal(records[0].ref,terminalRef);assert.equal(refund,0);assert.equal(charge,168);});
 await test('draft requires pollable gateway identity even if provider returns an immediate URL',async()=>{providerResponse={data:[{url:'https://fixture.invalid/sync.mp4'}]};assert.equal((await send()).status,502);assert.equal(refund,168);assert.equal(rows[0].status,'failed');assert.equal(records.length,0);});
 console.log(`Draft submit/validation: ${checks} actual route cases passed. No paid calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
