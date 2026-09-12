const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
(async()=>{
 const c=await sql.connect();
 try{
 await c.query('BEGIN READ ONLY');
 const defaults=await c.query("select name,setting,unit from pg_settings where name in ('statement_timeout','idle_in_transaction_session_timeout')");
 await c.query("SET LOCAL statement_timeout='5s'");
 const report={at:new Date().toISOString(),pooled: new URL(process.env.POSTGRES_URL).hostname.includes('-pooler'),queries:{},originalTimeouts:defaults.rows};
 const queries={
 settings:"select name,setting,unit from pg_settings where name in ('max_connections','shared_buffers','work_mem','statement_timeout','idle_in_transaction_session_timeout')",
 database:"select pg_database_size(current_database()) as bytes, numbackends, xact_commit,xact_rollback,blks_read,blks_hit,temp_bytes,deadlocks from pg_stat_database where datname=current_database()",
 tables:"select relname,n_live_tup,n_dead_tup,seq_scan,idx_scan,pg_total_relation_size(relid) as bytes from pg_stat_user_tables order by pg_total_relation_size(relid) desc",
 connections:"select state,count(*) from pg_stat_activity where datname=current_database() group by state",
 contentSizes:"select count(*) as rows,count(*) filter (where url like 'data:%') as inline_media_rows,max(octet_length(url)) as max_url_bytes from generations",
 indexes:"select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname"
 };
 for(const [name,q] of Object.entries(queries)){ const start=performance.now(); const r=await c.query(q);report.queries[name]={ms:Math.round(performance.now()-start),rows:r.rows}; }
 await c.query('ROLLBACK');
 const out=process.env.USERPROFILE+'/blue-wing-backups/capacity-db-20260912.json';fs.writeFileSync(out,JSON.stringify(report,null,2));
 console.log(JSON.stringify({pooled:report.pooled,settings:report.queries.settings.rows,database:report.queries.database.rows,tables:report.queries.tables.rows.slice(0,10),originalTimeouts:report.originalTimeouts,contentSizes:report.queries.contentSizes.rows,connections:report.queries.connections.rows}));
 }finally{c.release(); await sql.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
