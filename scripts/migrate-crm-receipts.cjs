const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
(async()=>{
 await sql.query("ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb, ADD COLUMN IF NOT EXISTS provider_cost_usd numeric(18,8), ADD COLUMN IF NOT EXISTS provider_usage jsonb");
 console.log('Billing receipt columns ready; historical costs, credits and discounts unchanged');
 await sql.end();
})().catch(()=>{console.error('Billing receipt migration failed');process.exitCode=1});
