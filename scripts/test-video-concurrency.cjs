const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
// Exercise the actual route query in a rollback-only PostgreSQL fixture. No real rows or provider I/O.
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
const source=fs.readFileSync('app/api/videos/route.ts','utf8');
const match=source.match(/async function countInFlightVideoJobs[\s\S]*?return rows\[0\]\?\.n \?\? 0;\s*}/);assert.ok(match);
(async()=>{const c=await sql.connect();try{
 await c.query('BEGIN');
 await c.query(`create temporary table credit_ledger(id bigint,user_id bigint,reason text,delta integer,ref text) on commit drop;
 create temporary table generations(user_id bigint,ref text) on commit drop;
 create temporary table character_idle_videos(user_id bigint,job_id text,charge_id bigint,status text) on commit drop;
 create temporary table character_scene_requests(user_id bigint,job_id text,status text) on commit drop;`);
 const execute=async(strings,...values)=>{let q=strings[0];values.forEach((_,i)=>q+='$'+(i+1)+strings[i+1]);return c.query(q,values);};
 const fn=new Function('sql',ts.transpileModule(match[0],{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return countInFlightVideoJobs;')(execute);
 await c.query("insert into credit_ledger values(1,7,'video',-10,'failed'),(2,7,'video',-10,'idle'),(3,7,'video',-10,'scene'),(4,7,'video',-10,'pending'),(5,7,'video',-10,'history'),(6,7,'video',-10,'legacy')");
 assert.equal(await fn(7),6);
 await c.query("insert into credit_ledger values(7,7,'charge_refund',10,'1'),(8,7,'video_refund',10,'legacy'); insert into character_idle_videos values(7,'idle',2,'completed');insert into character_scene_requests values(7,'scene','failed');insert into generations values(7,'history')");
 assert.equal(await fn(7),1);
 // Other-user terminal/refund records must never release this user's pending slot.
 await c.query("insert into character_idle_videos values(8,'pending',4,'completed');insert into credit_ledger values(9,8,'charge_refund',10,'4')");assert.equal(await fn(7),1);
 await c.query("insert into character_idle_videos values(7,'pending',4,'completed')");assert.equal(await fn(7),0);
 console.log('PASS video concurrency SQL: exact refunds, companion completed/failed, history, active slot retention and cross-user isolation. Temporary fixtures rolled back.');
}finally{await c.query('ROLLBACK');c.release();}process.exit(0);})().catch(()=>{console.error('Video concurrency test failed; no rows or credentials printed.');process.exit(1)});
