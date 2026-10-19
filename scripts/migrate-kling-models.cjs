/** Add reviewed Kling video rates and retire only Happyhorse 1.0; historical ledger stays unchanged. */
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const { sql } = require('@vercel/postgres');
// Initial retail policy follows the current Wan rate-card ratio (200 base credits/USD),
// rounded up. The shared resolution multiplier applies in both quote and settlement.
// SIRAYA provider prices are from the owner's 2026-10-19 catalog; these credits are not provider costs.
const rates=[['kling-2.5-turbo',9],['kling-2.6',9],['kling-3.0',17],['kling-3.0-omni',17],['kling-3.0-turbo',23],['kling-o1',17],['minimax-h3',16],['minimax-h3-max',10]];
(async()=>{
  const client=await sql.connect();
  try{
    await client.query('BEGIN');
    const removed=await client.query("update model_rates set active=false,updated_at=now() where lower(model_id) ~ '(^|-)happyhorse-1[.]0-(t2v|i2v|r2v|video-edit)$' returning model_id");
    for(const [id,credits] of rates) await client.query("insert into model_rates(model_id,modality,credits,active) values($1,'video',$2,true) on conflict(model_id) do nothing",[id,credits]);
    await client.query("insert into model_rates(model_id,modality,credits,active) values('minimax-m3','text',2,true) on conflict(model_id) do nothing");
    const expected=[...rates.map(([id])=>({id,modality:'video'})),{id:'minimax-m3',modality:'text'}];
    const verified=await client.query("select model_id,modality,credits,active from model_rates where lower(model_id)=any($1::text[]) order by model_id",[expected.map(({id})=>id)]);
    for(const {id,modality} of expected){
      const matches=verified.rows.filter(row=>row.model_id.toLowerCase()===id);
      if(matches.length!==1||matches[0].modality!==modality||matches[0].active!==true||!Number.isSafeInteger(Number(matches[0].credits))||Number(matches[0].credits)<=0)throw new Error('Creative model rate catalog needs review');
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({retired:removed.rows.map(row=>row.model_id),newModels:verified.rows,historicalRecordsUnchanged:true}));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await sql.end();}
})().catch(()=>{console.error('Kling migration failed; connection details withheld.');process.exitCode=1;});
