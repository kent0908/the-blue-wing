/** Actual poll route + draft receipt persistence, in-memory database/provider. No paid calls. */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
const rules=load('lib/seedanceDraftRules.ts');
const native='cgt-20261010012345-fixture';let row,receipt,history,owner,providerCalls,refunds,recorded;
function reset(){row={id:'1',user_id:7,job_id:'video_draft',status:'processing',upstream_task_id:null,prompt:'feather',seconds:8,created_at:new Date(Date.now()-10000).toISOString(),expires_at:new Date(Date.now()+604790000).toISOString(),final_status:null,final_job_id:null,url:null,final_url:null};receipt={status:'completed',output_url:'https://ark.tos-ap-southeast-1.volces.com/'+native+'.mp4',vendor_data:{draft:true,created_at:Math.floor(Date.now()/1000)}};history=new Map();owner=true;providerCalls=0;refunds=new Set();recorded=[];}
const sql=async(strings,...p)=>{
 const q=strings.join('?');
 if(q.includes('select id from credit_ledger'))return {rows:owner?[{id:'charge_'+p[1]}]:[]};
 if(q.includes('select created_at from credit_ledger'))return {rows:[{created_at:row.created_at}]};
 if(q.includes('select url from generations'))return {rows:history.has(p[1])?[{url:history.get(p[1])}]:[]};
 if(q.includes('select * from seedance_drafts')||q.includes('select d.*')){
  const found=owner&&p[0]===7&&(q.includes('(d.job_id=')?(row.job_id===p[1]||row.final_job_id===p[2]):q.includes('final_job_id=')?row.final_job_id===p[1]:row.job_id===p[1]);
  return {rows:found?[{...row}]:[]};
 }
 if(q.includes('set status=')){row.status=p[0];row.url=p[1]??row.url;row.upstream_task_id=p[2]??row.upstream_task_id;row.expires_at=new Date(Math.min(new Date(row.expires_at).getTime(),new Date(p[3]).getTime())).toISOString();return {rows:[]};}
 if(q.includes('set final_status=')){row.final_status=p[0];row.final_url=p[1]??row.final_url;return {rows:[]};}
 throw Error('Unexpected SQL fixture');
};
const drafts=load('lib/seedanceDraft.ts',{'./db':{sql},'./credits':{creditCost:async i=>i.resolution==='480p'?336:1848},'./seedanceDraftRules':rules});
const route=load('app/api/videos/[id]/route.ts',{
 'next/server':{NextRequest,NextResponse},'@/lib/apiauth':{requireUser:async()=>({user:{id:7}})},'@/lib/db':{sql},
 '@/lib/crm':{recordProviderReceipt:async()=>{}},'@/lib/alerts':{raiseAlert:async()=>{}},'@/lib/siraya':{getVideoStatus:async()=>{providerCalls++;return receipt;}},
 '@/lib/errors':{errorResponse:e=>NextResponse.json({error:{message:e.message}},{status:500})},'@/lib/creditTransactions':{refundCharge:async(u,id)=>refunds.add(id)},
 '@/lib/generations':{recordGeneration:async(u,g)=>{recorded.push(g);history.set(g.ref,g.url);}},'@/lib/mediaStore':{persistGeneratedMedia:async()=>'/api/media/generations/7/fixture.mp4'},
 '@/lib/seedanceDraft':drafts,'@/lib/seedanceDraftRules':rules,
});
const send=(id='video_draft')=>route.GET(new NextRequest('https://fixture.invalid/api/videos/'+id),{params:Promise.resolve({id})});
let checks=0;async function test(name,fn){reset();await fn();checks++;console.log('PASS '+name);}
(async()=>{
 await test('completed source captures gateway/native IDs, expiry, media and history without client prompt',async()=>{const r=await send(),j=await r.json();assert.equal(r.status,200);assert.equal(row.upstream_task_id,native);assert.equal(row.status,'completed');assert.equal(j.draft.canFinalize,true);assert.equal(j.draft.id,'video_draft');assert.equal(j.raw,undefined);assert.equal(j.draft.upstreamTaskId,undefined);assert.equal(recorded[0].model,'SIRAYA-Seedance-2.5');assert.equal(recorded[0].prompt,'feather');assert.equal(j.draft.finalCredits,1848);});
 await test('durable saved source survives upstream expiry without another provider lookup',async()=>{row.status='completed';row.upstream_task_id=native;row.url='/api/media/generations/7/source.mp4';const j=await (await send()).json();assert.equal(j.status,'completed');assert.equal(j.url,row.url);assert.equal(providerCalls,0);});
 await test('metadata write recovery still fetches receipt when history was saved first',async()=>{history.set('video_draft','/api/media/generations/7/source.mp4');await send();assert.equal(providerCalls,1);assert.equal(row.upstream_task_id,native);});
 await test('historical draft fee comes from ledger while final price stays current',async()=>{row.draft_credits=300;row.draft_credits_spent=300;const view=await drafts.publicDraft(row);assert.equal(view.draftCredits,300);assert.equal(view.finalCredits,1848);assert.equal(view.totalCredits,2148);row.draft_credits_spent=0;assert.equal((await drafts.publicDraft(row)).draftCreditsSpent,0);});
 await test('other user cannot poll either stage',async()=>{owner=false;assert.equal((await send()).status,404);assert.equal(providerCalls,0);});
 await test('matching final retains original draft provenance and stores final result',async()=>{row.status='completed';row.upstream_task_id=native;row.final_job_id='video_final';row.final_status='processing';receipt.vendor_data={draft:false,draft_task_id:native};const j=await (await send('video_final')).json();assert.equal(j.status,'completed');assert.equal(row.final_status,'completed');assert.equal(row.final_url,'/api/media/generations/7/fixture.mp4');assert.equal(j.draft.finalId,'video_final');assert.equal(j.draft.canFinalize,false);assert.equal(refunds.size,0);});
 await test('wrong final provenance fails, refunds once and never records a wrong result',async()=>{row.status='completed';row.upstream_task_id=native;row.final_job_id='video_final';row.final_status='processing';receipt.vendor_data={draft:false,draft_task_id:'cgt-other'};let j=await (await send('video_final')).json();assert.equal(j.status,'failed');assert.equal(j.url,null);assert.equal(j.error.code,'draft_final_mismatch');assert.equal(row.final_status,'failed');assert.equal(recorded.length,0);await send('video_final');assert.equal(refunds.size,1);});
 await test('draft completed without a video is failed and refunded',async()=>{delete receipt.output_url;const j=await (await send()).json();assert.equal(j.status,'failed');assert.equal(row.status,'failed');assert.equal(refunds.size,1);assert.equal(j.draft.canFinalize,false);});
 console.log(`Draft poll + receipt/history: ${checks} actual route cases passed. No paid calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
