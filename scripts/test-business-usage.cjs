/** Actual usage filters/report/route. Mock database rows only; no network or paid calls. */
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
function load(file, mocks = {}) { const loaded = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), loaded, loaded.exports); return loaded.exports; }
const { BusinessError } = load('lib/businessTypes.ts');
const adult = load('lib/adultGate.ts', { './i18n/k': { k: value => value } });
const range = load('lib/crmRange.ts');
const account = { id: '11111111-1111-4111-8111-111111111111' };
let calls = [], approved = true, user = { id: 7, birth_date: '1994-09-08' };
let stats = { requests: 137, completed: 100, failed: 20, pending: 17, matched_count: 3, matched_cost: '0.123457', unmatched_count: 134 };
const helper = load('lib/businessUsage.ts', { 'server-only': {}, './db': { sql: { query: async (query, values) => {
  calls.push({ query, values });
  if (query.startsWith('select distinct')) return { rows: [{ model: 'SIRAYA-Seedance-2.5' }] };
  if (query.startsWith('select count')) return { rows: [{ ...stats }] };
  return { rows: [{ id: 'fixture-owned-job' }] };
} } }, './adultGate': adult, './businessTypes': { BusinessError }, './crmRange': range,
  './businessGeneration': { publicBusinessGeneration: row => ({ id: row.id, providerCost: null }) } });
const route = load('app/api/business/usage/route.ts', { '@/lib/businessUsage': helper, '@/lib/business': {
  requireBusiness: async () => approved ? { user, account } : { error: NextResponse.json({ error: { code: 'business_not_approved' } }, { status: 403 }) },
  businessJson: value => NextResponse.json(value, { headers: { 'cache-control': 'private, no-store' } }),
  businessErrorResponse: (_req, error) => NextResponse.json({ error: { code: error.code || 'unavailable' } }, { status: error.status || 503 }),
} });
(async () => {
  const f = helper.businessUsageFilters(new URLSearchParams({ from: '2026-10-01', to: '2026-10-20', model: 'SIRAYA-Seedance-2.5', status: 'completed', kind: 'video', page: '2' }));
  assert.equal(f.range.since, '2026-09-30T16:00:00.000Z'); assert.equal(f.range.until, '2026-10-20T16:00:00.000Z'); assert.equal(f.page, 2);
  for (const query of [{ page: '0' }, { page: '10001' }, { page: '1e2' }, { from: '2026-02-30', to: '2026-03-01' }, { from: '2024-01-01', to: '2026-01-01' }, { from: '2026-10-01' }, { model: 'stolen/row' }, { status: 'all-other-users' }, { accountId: 'foreign' }, { kind: 'audio' }]) assert.throws(() => helper.businessUsageFilters(new URLSearchParams(query)), error => error.code === 'invalid_parameters');
  const result = await helper.businessUsageReport(user, account, new URLSearchParams({ from: '2026-10-01', to: '2026-10-20', page: '2' }));
  assert.equal(result.pagination.pageSize, 50); assert.equal(result.pagination.total, 137); assert.equal(result.pagination.totalPages, 3); assert.equal(result.pagination.hasMore, true);
  assert.equal(result.generations.length, 1); assert.equal(result.stats.requests, 137, 'filtered totals must not be derived from the current page length'); assert.equal(result.stats.matchedCost, '0.123457'); assert.equal(result.stats.unmatchedCount, 134); assert.deepEqual(result.models, ['SIRAYA-Seedance-2.5']);
  for (const call of calls) { assert.equal(call.values[0], account.id); assert.equal(call.values[1], 7); assert.equal(call.values[2], true); assert.match(call.query, /account_id=\$1 and user_id=\$2 and \(\$3::boolean or nsfw=false\)/); }
  const pageQuery = calls.find(call => call.query.startsWith('select *')); assert.deepEqual(pageQuery.values.slice(-2), [50, 50]);
  user.birth_date = '2015-09-08'; calls = []; await helper.businessUsageReport(user, account, new URLSearchParams()); assert.equal(calls.every(call => call.values[2] === false), true, 'models, rows and totals all respect current age');
  stats = { requests: 0, completed: 0, failed: 0, pending: 0, matched_count: 0, matched_cost: null, unmatched_count: 0 };
  assert.equal((await helper.businessUsageReport(user, account, new URLSearchParams())).stats.matchedCost, null, 'no invoice coverage must not be shown as a known zero spend');
  const response = await route.GET(new NextRequest('https://thebluewing.studio/api/business/usage?from=2026-10-01&to=2026-10-20')); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private.*no-store/);
  approved = false; const before = calls.length; assert.equal((await route.GET(new NextRequest('https://thebluewing.studio/api/business/usage'))).status, 403); assert.equal(calls.length, before);
  console.log('PASS BYOK usage: Taipei date boundaries, 366-day/50-row pagination limits, model/status/kind filters, full filtered totals, current owner/age scope in every query, unknown costs remain null, private route and approval gate. No network or paid calls.');
})().catch(error => { console.error('FAIL BYOK usage:', error.stack); process.exitCode = 1; });
