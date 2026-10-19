/** Run explicitly against the intended environment; this never prints connection strings. */
const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const { sql } = require('@vercel/postgres');
(async () => {
  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname, 'business.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.join(__dirname, 'business-generations.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('PASS additive business account, encrypted credential, audit and isolated generation schema; no account approved or key imported.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await sql.end();
  }
})().catch(() => { console.error('Business schema migration failed; connection details withheld.'); process.exitCode = 1; });
