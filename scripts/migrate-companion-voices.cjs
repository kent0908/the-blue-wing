const {loadEnvConfig}=require('@next/env');
loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;
const {sql}=require('@vercel/postgres');
(async()=>{
 await sql`alter table characters add column if not exists speech_language text check (speech_language in ('ja-JP','zh-TW','en-US'))`;
 await sql`alter table character_messages add column if not exists speech_language text check (speech_language in ('ja-JP','zh-TW','en-US'));`;
 console.log('PASS companion speech_language migration');
 await sql.end();
})().catch(()=>{console.error('Migration failed');process.exitCode=1});
