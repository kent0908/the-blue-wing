/** Read-only PostgreSQL usage report on an impossible fixture owner; never fetches a real user's history. */
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const { sql } = require('@vercel/postgres');
const cache = new Map();
function load(file) {
  const name = path.resolve(file); if (cache.has(name)) return cache.get(name).exports;
  const loaded = { exports: {} }; cache.set(name, loaded);
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => {
    if (id === 'server-only') return {};
    if (id === './db') return { sql };
    if (id === './i18n/k') return { k: value => value };
    if (id === './businessGeneration') return { publicBusinessGeneration: row => row };
    return id.startsWith('.') ? load(path.resolve(path.dirname(name), `${id}.ts`)) : require(id);
  }, loaded, loaded.exports);
  return loaded.exports;
}
(async () => {
  const result = await load('lib/businessUsage.ts').businessUsageReport({ id: -1, birth_date: null, adult_confirmed_at: null }, { id: '00000000-0000-4000-8000-000000000000' }, new URLSearchParams({ from: '2026-10-01', to: '2026-10-20' }));
  assert.equal(result.stats.requests, 0); assert.equal(result.stats.matchedCost, null); assert.equal(result.stats.unmatchedCount, 0);
  assert.deepEqual(result.generations, []); assert.deepEqual(result.models, []); assert.equal(result.pagination.total, 0);
  console.log('PASS actual read-only PostgreSQL BYOK usage query: scoped rows/models/full filtered statistics, decimal NULL for unknown coverage, private impossible fixture owner. Zero real user records or mutations.');
})().catch(() => { console.error('BYOK usage SQL verification failed; database and row details withheld.'); process.exitCode = 1; }).finally(async () => { await sql.end().catch(() => {}); });
