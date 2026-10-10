/** Real route + rules, simulated provider/ledger. No paid calls or live user data. */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
const rules=load('lib/seedanceDraftRules.ts');
const requestId='51c1f865-76af-4cd3-a3ce-bf07a8d2cde0';
const retryId='51c1f865-76af-4cd3-a3ce-bf07a8d2cde1';
const native='cgt-20261010012345-fixture';
assert.equal(rules.extractDraftUpstreamId({vendor_data:{draft:true},output_url:'https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/folder/'+native+'.mp4?signature=fixture'}),native);
for(const output_url of ['https://evil.example/'+native+'.mp4','http://x.volces.com/'+native+'.mp4','https://x.volces.com.evil.example/'+native+'.mp4','https://user:pass@x.volces.com/'+native+'.mp4','https://x.volces.com/other.mp4'])assert.equal(rules.extractDraftUpstreamId({vendor_data:{draft:true},output_url}),null);
assert.equal(rules.extractDraftUpstreamId({vendor_data:{draft:false},output_url:'https://x.volces.com/'+native+'.mp4'}),null);
const now=Date.now(),submitted=new Date(now-10000).toISOString();
assert.equal(new Date(rules.draftExpiryFromReceipt({vendor_data:{created_at:(now+3600000)/1000}},submitted,now)).getTime(),new Date(submitted).getTime()+604800000);
assert.deepEqual(rules.buildDraftFinalPayload(native),{model:'SIRAYA-Seedance-2.5',resolution:'1080p',async:true,extra_body:{content:[{type:'draft_task',draft_task:{id:native}}],draft:false,watermark:false}});
assert.throws(()=>rules.buildDraftFinalPayload('video_gateway'));
assert.ok(rules.draftRequestIdValid(requestId));assert.ok(!rules.draftRequestIdValid('arbitrary'));
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
class ConfigError extends Error{}
let row,balance,calls,refunded,charged,result,providerError,inFlight;
function reset(){row={id:'1',user_id:7,job_id:'video_draft_owned',status:'completed',upstream_task_id:native,prompt:'blue feather',seconds:8,expires_at:new Date(Date.now()+86400000).toISOString(),final_status:null,final_attempt_ids:[]};balance=5000;calls=[];refunded=0;charged=0;providerError=null;inFlight=0;result={id:'video_final_owned',status:'processing'};}
const sql=async(strings,...p)=>{
 const q=strings.join('?');
 if(q.includes("final_status='submitting'")){
   if(row.user_id!==p[2]||row.job_id!==p[3]||!['failed',null].includes(row.final_status)||row.final_attempt_ids.includes(p[4])||new Date(row.expires_at)<=new Date())return {rows:[]};
   row.final_status='submitting';row.final_request_id=p[0];row.final_attempt_ids.push(p[1]);return {rows:[{id:row.id}]};
 }
 if(q.includes('set final_charge_id=')){row.final_charge_id=p[0];return {rows:[]};}
 if(q.includes('set final_job_id=')){row.final_job_id=p[0];row.final_status='processing';return {rows:[]};}
 if(q.includes("set final_status='unknown'")){row.final_status='unknown';return {rows:[]};}
 if(q.includes("set final_status='failed'")){row.final_status='failed';return {rows:[]};}
 if(q.includes('set final_status=')){row.final_status=p[0];return {rows:[]};}
 throw Error('Unexpected SQL fixture');
};
const mocks={
 'next/server':{NextRequest,NextResponse},'@/lib/apiauth':{requireUser:async()=>({user:{id:7}})},
 '@/lib/companionGenerationAccess':{assertModelAccess(){}},'@/lib/db':{sql},
 '@/lib/creditTransactions':{paidCall:async(user,cost,kind,model,fn,usage)=>{assert.equal(user,7);assert.equal(kind,'video');assert.equal(model,'SIRAYA-Seedance-2.5');assert.deepEqual(usage,{units:8,resolution:'1080p'});charged+=cost;balance-=cost;try{return {result:await fn('charge_fixture'),chargeId:'charge_fixture'};}catch(e){balance+=cost;refunded++;throw e;}},refundCharge:async()=>{refunded++;balance+=1848;}},
 '@/lib/credits':{creditCost:async()=>1848,getBalance:async()=>balance},
 '@/lib/siraya':{SirayaApiError:ApiError,SirayaConfigError:ConfigError,createVideoFromDraft:async payload=>{calls.push(payload);if(providerError)throw providerError;return result;}},
 '@/lib/errors':{errorResponse:e=>NextResponse.json({error:{message:e.message}},{status:e.status??500})},
 '@/lib/seedanceDraft':{getOwnedDraft:async(user,id)=>row.user_id===user&&row.job_id===id?{...row}:null,publicDraft:async r=>({id:r.job_id,canFinalize:rules.draftCanFinalize(r),finalId:r.final_job_id}),saveDraftReceipt:async()=>{row.final_status='completed';}},
 '@/lib/seedanceDraftRules':rules,'@/lib/videoConcurrency':{MAX_CONCURRENT_VIDEO_JOBS:4,countInFlightVideoJobs:async()=>inFlight},
 '@/lib/mediaStore':{persistGeneratedMedia:async()=>'/api/media/generations/7/final.mp4'},'@/lib/generations':{recordGeneration:async()=>{}},
};
const route=load('app/api/videos/drafts/[id]/finalize/route.ts',mocks);
const send=(body={clientRequestId:requestId},expected='1848',id='video_draft_owned')=>route.POST(new NextRequest('https://fixture.test/api/videos/drafts/'+id+'/finalize',{method:'POST',headers:expected===null?{}:{'x-blue-wing-expected-credits':expected},body:JSON.stringify(body)}),{params:Promise.resolve({id})});
let checks=0;async function test(name,run){reset();await run();checks++;console.log('PASS '+name);}
(async()=>{
 await test('ownership rejects another user source before charging',async()=>{row.user_id=8;assert.equal((await send()).status,404);assert.equal(calls.length,0);assert.equal(charged,0);});
 await test('expired native task cannot finalize',async()=>{row.expires_at=new Date(Date.now()-1).toISOString();assert.equal((await send()).status,410);assert.equal(charged,0);});
 await test('missing source task cannot finalize',async()=>{row.upstream_task_id=null;assert.equal((await send()).status,409);assert.equal(charged,0);});
 await test('inherited params rejected before charging',async()=>{assert.equal((await send({clientRequestId:requestId,prompt:'override'})).status,400);assert.equal(charged,0);});
 await test('quote must be explicitly current',async()=>{for(const v of ['1',null,'1848junk'])assert.equal((await send(undefined,v)).status,409);assert.equal(charged,0);});
 await test('insufficient credits and concurrency reject without provider I/O',async()=>{balance=1;assert.equal((await send()).status,402);balance=5000;inFlight=4;assert.equal((await send()).status,429);assert.equal(calls.length,0);});
 await test('double click atomically submits and charges once',async()=>{const responses=await Promise.all([send(),send()]);assert.ok(responses.every(r=>r.status===200));assert.equal(calls.length,1);assert.equal(charged,1848);assert.deepEqual(calls[0],rules.buildDraftFinalPayload(native));const again=await (await send()).json();assert.equal(again.duplicate,true);assert.equal(again.creditsSpent,0);});
 await test('unknown network outcome refunded and cannot auto-replay',async()=>{providerError=new Error('transport timeout');assert.equal((await send()).status,500);assert.equal(row.final_status,'unknown');assert.equal(refunded,1);providerError=null;assert.equal((await send()).status,409);assert.equal(calls.length,1);});
 await test('explicit provider rejection permits a deliberate new attempt',async()=>{providerError=new ApiError(402,'quota');assert.equal((await send()).status,402);assert.equal(row.final_status,'failed');assert.equal(refunded,1);providerError=null;const replay=await (await send()).json();assert.equal(replay.duplicate,true);assert.equal(replay.status,'failed');assert.equal(replay.creditsSpent,0);assert.equal(calls.length,1);assert.equal((await send({clientRequestId:retryId})).status,200);assert.equal(calls.length,2);});
 await test('failed A then failed B cannot replay delayed A or B',async()=>{providerError=new ApiError(402,'quota');assert.equal((await send()).status,402);assert.equal((await send({clientRequestId:retryId})).status,402);assert.equal(calls.length,2);providerError=null;for(const id of [requestId,retryId]){const j=await (await send({clientRequestId:id})).json();assert.equal(j.duplicate,true);assert.equal(j.status,'failed');assert.equal(j.creditsSpent,0);}assert.equal(calls.length,2);assert.equal(refunded,2);});
 await test('missing gateway ID refunds but keeps uncertain task blocked',async()=>{result={status:'processing'};assert.equal((await send()).status,502);assert.equal(row.final_status,'unknown');assert.equal(refunded,1);assert.equal((await send()).status,409);assert.equal(calls.length,1);});
 await test('immediate result requires exact native draft provenance',async()=>{result={id:'video_final_owned',output_url:'https://fixture.test/final.mp4',vendor_data:{draft_task_id:'cgt-other'}};assert.equal((await send()).status,502);assert.equal(row.final_status,'failed');assert.equal(refunded,1);});
 await test('immediate matching result persists and returns durable media',async()=>{result={id:'video_final_owned',output_url:'https://fixture.test/final.mp4',vendor_data:{draft_task_id:native}};const r=await send();const j=await r.json();assert.equal(r.status,200);assert.equal(j.url,'/api/media/generations/7/final.mp4');assert.equal(row.final_status,'completed');assert.equal(refunded,0);});
 console.log(`Seedance draft rules + finalize route: ${checks} cases passed. No paid calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
