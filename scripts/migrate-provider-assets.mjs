import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
createRequire(import.meta.url)('@next/env').loadEnvConfig(join(here,'..'),false,{info(){},error(){}});
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || '';
if(!process.env.POSTGRES_URL){console.error('Database is not configured');process.exit(1);}
const {sql}=await import('@vercel/postgres');
try {await sql.query(readFileSync(join(here,'migrate-provider-assets.sql'),'utf8'));console.log('Provider asset schema ready.');process.exit(0);}catch{console.error('Provider asset migration failed.');process.exit(1);}
