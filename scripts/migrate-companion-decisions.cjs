const {loadEnvConfig}=require('@next/env');
loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
sql.query(require('fs').readFileSync('scripts/migrate-companion-decisions.sql','utf8')).then(()=>{console.log('Companion decision schema ready');process.exit(0)}).catch(()=>{console.error('Migration failed');process.exit(1)});
