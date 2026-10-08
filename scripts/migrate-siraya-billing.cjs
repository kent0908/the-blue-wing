const fs = require('node:fs');
process.loadEnvFile('.env.local');
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;
const {sql} = require('@vercel/postgres');
(async()=>{
 await sql.query(fs.readFileSync('scripts/siraya-billing.sql','utf8'));
 console.log('PASS additive SIRAYA billing migration; no financial history repriced');
 await sql.end();
})().catch(()=>{console.error('SIRAYA billing migration failed');process.exitCode=1});
