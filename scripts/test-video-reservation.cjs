/** Actual paidCall + concurrency helper under a simulated per-user row lock. No paid/network/database calls. */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const ledger=[{id:'grant',user_id:7,delta:10000,reason:'grant',ref:null,created_at:new Date().toISOString(),expires_at:null}],completed=new Set();
let tail=Promise.resolve(),sequence=0,providerCalls=0,lockedCounts=0;
async function acquire(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;return release;}
const active=()=>ledger.filter(r=>r.user_id===7&&r.reason==='video'&&r.delta<0&&!completed.has(r.ref)).length;
function client(){let unlock,inserted=[];return {release(){if(unlock){unlock();unlock=null;}},async query(q,p=[]){
 if(q==='BEGIN')return {rows:[]};
 if(q.startsWith('SELECT id FROM users')){unlock=await acquire();return {rows:[{id:7}]};}
 if(q==='COMMIT'||q==='ROLLBACK'){if(q==='ROLLBACK')for(const id of inserted){const index=ledger.findIndex(r=>r.id===id);if(index>=0)ledger.splice(index,1);}if(unlock){unlock();unlock=null;}return {rows:[]};}
 if(q.startsWith('SELECT id,delta'))return {rows:ledger.filter(r=>r.user_id===p[0])};
 if(q.includes('select count(*)::int as n')){assert.ok(unlock,'concurrency must be checked while the user row is locked');lockedCounts++;return {rows:[{n:active()}]};}
 if(q.startsWith('INSERT INTO credit_ledger')){assert.ok(unlock);const id='charge_'+(++sequence);inserted.push(id);ledger.push({id,user_id:p[0],delta:p[1],reason:p[2],ref:p[3],created_at:new Date().toISOString(),expires_at:null});return {rows:[{id}]};}
 throw Error('Unexpected transaction fixture');
 }};}
const sql={connect:async()=>client(),query:async(q,p)=>{assert.ok(q.startsWith('UPDATE credit_ledger SET ref='));const row=ledger.find(r=>r.id===p[1]&&r.user_id===p[2]);assert.ok(row);row.ref=p[0];return {rows:[]};}};
const concurrency=load('lib/videoConcurrency.ts',{'./db':{sql}});
const tx=load('lib/creditTransactions.ts',{'./db':{sql},'./videoConcurrency':concurrency,'./creditReplay':load('lib/creditReplay.ts'),'./billingContext':load('lib/billingContext.ts'),'./siraya':{SirayaApiError:ApiError},'./alerts':{alertGenerationFailure(){}},'./crm':{quoteCost:async()=>null,recordUsageEvent:async()=>{},markUsageRefunded:async()=>{}}});
(async()=>{
 const releases=[];let rejected=0;
 const submissions=Array.from({length:5},(_,i)=>tx.paidCall(7,100,'video','fixture',async()=>{providerCalls++;await new Promise(resolve=>releases.push(resolve));return {id:'video_'+i};}).catch(e=>{assert.equal(e.status,429);rejected++;return 'blocked';}));
 for(let i=0;i<100&&(providerCalls!==4||rejected!==1);i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(providerCalls,4);assert.equal(rejected,1);assert.equal(active(),4);assert.equal(ledger.filter(r=>r.reason==='video').length,4);assert.ok(ledger.filter(r=>r.reason==='video').every(r=>r.ref.startsWith('pending:')));
 for(const release of releases)release();await Promise.all(submissions);
 assert.equal(active(),4);assert.equal(lockedCounts,5);
 completed.add(ledger.find(r=>r.reason==='video').ref);
 const next=await tx.paidCall(7,100,'video','fixture',async()=>{providerCalls++;return {id:'video_new'};});
 assert.equal(next.result.id,'video_new');assert.equal(active(),4);assert.equal(providerCalls,5);
 console.log('PASS atomic video reservations: 5 concurrent requests reserve/pay only 4; provider-pending rows consume slots under user lock; completed job releases one slot. No paid calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
