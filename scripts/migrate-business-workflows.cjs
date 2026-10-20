const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
(async()=>{const client=await sql.connect();try{await client.query('BEGIN');await client.query(fs.readFileSync(path.join(__dirname,'business-workflows.sql'),'utf8'));await client.query('COMMIT');console.log('PASS additive business workflow schema; no consumer graphs, credits, keys or paid generations changed.');}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();await sql.end();}})().catch(()=>{console.error('Business workflow schema migration failed; connection details withheld.');process.exitCode=1;});
