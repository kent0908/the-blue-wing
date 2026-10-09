/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS CLI */
// Exact text IDs only. Never rewrite generations, usage, receipts or costs.
require('@next/env').loadEnvConfig(process.cwd());
process.env.POSTGRES_URL ||= process.env.DATABASE_URL;
const { createPool } = require('@vercel/postgres');
const replacements = [
  ['gemini-2.5-pro', 'gemini-3.1-pro-preview', 4],
  ['gemini-2.5-flash', 'gemini-3.8-flash', 2],
  ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 1],
];
(async () => {
  const pool = createPool(); const client = await pool.connect();
  try {
    await client.query('begin');
    const result = [];
    for (const [oldId, newId, credits] of replacements) {
      // Preserve previously configured retail prices; only fill missing rows.
      await client.query(`insert into model_rates (model_id,modality,credits,active)
        values ($1,'text',$2,true) on conflict (model_id) do nothing`, [newId, credits]);
      const rate = await client.query(`select modality,credits,active from model_rates where model_id=$1`, [newId]);
      if (!rate.rows[0]?.active || rate.rows[0].modality !== 'text') throw Error(`Replacement rate unavailable: ${newId}`);
      const retired = await client.query(`update model_rates set active=false,updated_at=now()
        where lower(model_id)=$1 and modality='text' and active`, [oldId]);
      const characters = await client.query(`update characters set model=$2,updated_at=now()
        where lower(model)=$1`, [oldId, newId]);
      const home = await client.query(`update home_blocks set model_id=$2,updated_at=now()
        where lower(model_id)=$1`, [oldId, newId]);
      result.push({oldId,newId,rate:Number(rate.rows[0].credits),retiredRates:retired.rowCount,characters:characters.rowCount,home:home.rowCount});
    }
    await client.query('commit'); console.log(JSON.stringify(result));
  } catch (e) { await client.query('rollback'); throw e; }
  finally { client.release(); await pool.end(); }
})().catch(e => { console.error(e.message); process.exitCode=1; });
