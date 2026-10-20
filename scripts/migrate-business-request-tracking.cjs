/** Additive BYOK transport receipts only. Never reads or changes provider keys, credits, users or existing job values. */
const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const { sql } = require('@vercel/postgres');
(async () => {
  const client = await sql.connect();
  let begun = false;
  try {
    await client.query('BEGIN'); begun = true;
    // The existing isolated job schema is the source of truth; all operations are CREATE/ADD IF NOT EXISTS.
    await client.query(fs.readFileSync(path.join(__dirname, 'business-generations.sql'), 'utf8'));
    const expected = { provider_request_id: 'text', provider_http_status: 'integer', provider_request_ids: 'ARRAY', provider_receipt_count: 'integer',
      submitted_at: 'timestamp with time zone', completed_at: 'timestamp with time zone', duration_ms: 'bigint', provider_cost: 'numeric',
      provider_currency: 'text', billing_status: 'text', billing_checked_at: 'timestamp with time zone', provider_billing_outcome: 'text', provider_duration_ms: 'bigint' };
    const { rows } = await client.query(`select column_name,data_type,is_nullable from information_schema.columns
      where table_schema='public' and table_name='business_generations'
        and column_name=any($1::text[])`, [Object.keys(expected)]);
    const byName = new Map(rows.map(row => [row.column_name, row]));
    if (Object.entries(expected).some(([column, type]) => byName.get(column)?.data_type !== type)) throw new Error('schema_verification');
    await client.query('COMMIT'); begun = false;
    console.log('PASS 13 additive BYOK receipt/cost/timing fields verified; no generation, credentials, consumer credits or existing job values changed.');
  } finally {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    client.release(); await sql.end();
  }
})().catch(() => { console.error('BYOK request tracking migration failed; connection details withheld.'); process.exitCode = 1; });
