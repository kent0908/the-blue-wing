const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd(),false,{info(){},error(){}});process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
(async()=>{await sql`alter table usage_events add column if not exists cost_known boolean not null default false`;console.log('CRM cost completeness column ready; prices and discounts unchanged');await sql.end()})().catch(e=>{console.error(e.message);process.exitCode=1});
