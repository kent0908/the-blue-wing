require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
const fs=require('node:fs'),ts=require('typescript');
const replay={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('lib/creditReplay.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(replay,replay.exports);
(async()=>{
 const {rows:owner}=await sql.query('select user_id from characters where id=$1',[7]);
 const userId=Number(owner[0]?.user_id);if(!Number.isSafeInteger(userId))throw Error('Missing owner');
 const {rows:events}=await sql.query('select id,delta,reason,ref,created_at,expires_at from credit_ledger where user_id=$1 order by created_at,id',[userId]);
 const recent=events.filter(e=>new Date(e.created_at).getTime()>Date.now()-60*60*1000);
 const {rows:idle}=await sql.query('select id,character_id,status,job_id,free,credits_spent,is_active,charge_id,refund_done,created_at,url is not null as has_result from character_idle_videos where user_id=$1 and character_id=$2 order by created_at desc limit 5',[userId,7]);
 const {rows:table}=await sql.query("select to_regclass('public.generation_layer_sets') as existing");
 let layers=[];if(table[0].existing)({rows:layers}=await sql.query('select id,credits_spent,jsonb_array_length(layers) as layer_count,created_at from generation_layer_sets where user_id=$1 order by created_at desc limit 3',[userId]));
 const report={at:new Date().toISOString(),userId,replayedBalance:replay.exports.replayCredits(events),recentHourLedger:recent.map(({id,delta,reason,ref,created_at})=>({id,delta,reason,chargeRef:/refund/.test(reason)?ref:undefined,refPending:ref?.startsWith('pending:')||false,created_at})),idle:idle.map(({job_id,...r})=>({...r,hasJob:!!job_id})),layerSets:layers};
 fs.writeFileSync('live-generation-budget-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exit(0);
})().catch(()=>{console.error('Read-only generation audit failed; credentials and error details suppressed.');process.exitCode=1;});
