const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:id=>mocks[id]??require(id),process,console,Date,Map,Set,BigInt,URL,AbortSignal,fetch:(...args)=>global.fetch(...args)});return exports}
const api=load('lib/sirayaConsole.ts'),range=load('lib/crmRange.ts');
const raw=(id,cost=.000091)=>({request_id:id,account_id:'fixture-account',timestamp:'2026-10-06T12:00:00Z',model:'fixture-model',cost,currency:'USD',status:'success',usage:{prompt_tokens:10}});
(async()=>{
assert.equal(api.microsDecimal(api.decimalMicros('0.1')+api.decimalMicros('0.2')),'0.300000');
assert.equal(api.normalizeBillingRecord(raw('zero',0)).cost,'0.000000');
for(const cost of [null,-1,Infinity,.1234567])assert.throws(()=>api.normalizeBillingRecord(raw('bad',cost)));
assert.equal(api.billingCoverage('2026-10-01T00:00:00Z','2026-10-03T00:00:00Z',[{since:'2026-10-01T00:00:00Z',until:'2026-10-02T12:00:00Z'},{since:'2026-10-02T00:00:00Z',until:'2026-10-03T00:00:00Z'}]).complete,true);
assert.equal(api.billingCoverage('2026-10-01T00:00:00Z','2026-10-03T00:00:00Z',[]).complete,false);
assert.equal(range.reportRange(1,'2026-10-07','2026-10-07').since,'2026-10-06T16:00:00.000Z');
process.env.SIRAYA_CONSOLE_TOKEN='csk-test-fixture';process.env.SIRAYA_CONSOLE_ACCOUNT_ID='fixture-account';let calls=0;
global.fetch=async url=>{calls++;const p=Number(url.searchParams.get('page'));return Response.json({isSuccess:true,data:{data:[raw('page-'+p)],page:p,has_more:p===1}})};
assert.equal((await api.fetchUsageWindow('2026-10-06T00:00:00Z','2026-10-07T00:00:00Z',AbortSignal.timeout(1000))).length,2);assert.equal(calls,2);
global.fetch=async url=>Response.json({isSuccess:true,data:{data:[raw('duplicate')],page:Number(url.searchParams.get('page')),has_more:true}});
await assert.rejects(()=>api.fetchUsageWindow('2026-10-06T00:00:00Z','2026-10-07T00:00:00Z',AbortSignal.timeout(1000)),e=>e.code==='unstable_pagination');
calls=0;global.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'60'}})};
await assert.rejects(()=>api.fetchUsageWindow('2026-10-06T00:00:00Z','2026-10-07T00:00:00Z',AbortSignal.timeout(1000)),e=>e.retryAfter===60);assert.equal(calls,1);
global.fetch=async url=>Response.json({isSuccess:true,data:url.pathname.includes('/usage/id')?raw('id'):{data:[],page:1,has_more:false}});
await assert.rejects(()=>api.fetchUsageRequest('id',AbortSignal.timeout(1000)),e=>e.code==='request_outside_scope');
global.fetch=async()=>Response.json({isSuccess:true,data:{data:[{id:'fixture-account',name:'TBW',is_archived:false}],default_account_id:'fixture-account'}});
assert.equal((await api.fetchConsoleAccounts(AbortSignal.timeout(1000)))[0].id,'fixture-account');
delete process.env.SIRAYA_CONSOLE_TOKEN;delete process.env.SIRAYA_CONSOLE_ACCOUNT_ID;
console.log('PASS exact money, missing/zero/invalid cost, scope, pagination, 429 no replay, coverage and Taipei boundaries');
// PostgreSQL fixtures live only in a rollback transaction; no production records are modified.
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});process.env.POSTGRES_URL ||=process.env.DATABASE_URL;const{sql}=require('@vercel/postgres');const client=await sql.connect();
try{await client.query('BEGIN');
await client.query('CREATE TEMP TABLE model_request_events(provider text,upstream_request_id text,charge_id bigint) ON COMMIT DROP');
await client.query('CREATE TEMP TABLE usage_events(charge_id bigint,provider_cost_usd numeric(18,6),provider_cost_source text,provider_cost_scope text,status text) ON COMMIT DROP');
await client.query('CREATE TEMP TABLE siraya_billing_records(scope_account_id text,account_id text,request_id text,requested_at timestamptz,model text,cost numeric(18,6),currency text,status text,usage jsonb,performance jsonb,charge_id bigint,match_state text, last_synced_at timestamptz,primary key(scope_account_id,account_id,request_id)) ON COMMIT DROP');
await client.query('CREATE TEMP TABLE siraya_billing_revisions(scope_account_id text,account_id text,request_id text,previous_cost numeric,next_cost numeric,previous_currency text,next_currency text) ON COMMIT DROP');
await client.query("INSERT INTO model_request_events VALUES ('siraya','first',1),('siraya','retry',1),('siraya','ambiguous',2),('siraya','ambiguous',3)");
await client.query("INSERT INTO usage_events VALUES (1,null,null,null,'refunded'),(2,null,null,null,'charged')");
const billing=load('lib/sirayaBilling.ts',{'./db':{sql},'./sirayaConsole':api});const rows=['first','retry','ambiguous','unmatched'].map(id=>api.normalizeBillingRecord(raw(id,.100001)));
await billing.saveBillingRecords(client,'fixture-account',rows);await billing.saveBillingRecords(client,'fixture-account',rows);
assert.equal((await client.query('SELECT count(*)::int n FROM siraya_billing_records')).rows[0].n,4);
assert.equal((await client.query('SELECT count(*)::int n FROM siraya_billing_revisions')).rows[0].n,0);
assert.equal((await client.query('SELECT provider_cost_usd::text cost FROM usage_events WHERE charge_id=1')).rows[0].cost,'0.200002');
assert.equal((await client.query("SELECT match_state FROM siraya_billing_records WHERE request_id='ambiguous'")).rows[0].match_state,'ambiguous');
rows[0].cost='.200001';await billing.saveBillingRecords(client,'fixture-account',[rows[0]]);assert.equal((await client.query('SELECT count(*)::int n FROM siraya_billing_revisions')).rows[0].n,1);
rows[0].currency='EUR';await billing.saveBillingRecords(client,'fixture-account',[rows[0]]);assert.equal((await client.query('SELECT provider_cost_usd FROM usage_events WHERE charge_id=1')).rows[0].provider_cost_usd,null);
console.log('PASS real PostgreSQL: duplicate sync, exact retry sums, refunds preserve spend, ambiguous IDs, immutable revisions, currency isolation');
}finally{await client.query('ROLLBACK');client.release();await sql.end()}
})().catch(e=>{console.error(e.code??e.message);process.exitCode=1});

