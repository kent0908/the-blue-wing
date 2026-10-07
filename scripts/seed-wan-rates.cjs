// Add only Wan 3.0 retail rates. Existing administrator edits are preserved.
// Dry-run by default; pass --apply to insert missing rows. No credential output.
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
const rates=[['wan3.0-video',10],['wan3.0-video-prime',14]];
(async()=>{
 for(const [id,credits] of rates){
  if(process.argv.includes('--apply')) await sql`insert into model_rates(model_id,modality,credits,active) select ${id},'video',${credits},true where not exists(select 1 from model_rates where lower(model_id)=lower(${id})) on conflict(model_id) do nothing`;
  const {rows}=await sql`select model_id,modality,credits,active from model_rates where lower(model_id)=lower(${id})`;
  console.log(JSON.stringify({proposed:{model:id,baseCredits:credits},current:rows[0]||null}));
 }
 await sql.end();
})().catch(e=>{console.error(e.code||e.name||'Rate migration failed');process.exitCode=1;});
