/** Actual owned-job billing helper + route, mocked SQL/Console only. No network, key reads or paid calls. */
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
function load(file, mocks = {}) {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), loaded, loaded.exports);
  return loaded.exports;
}
const { BusinessError } = load('lib/businessTypes.ts');
const adult = load('lib/adultGate.ts', { './i18n/k': { k: value => value } });
const actualConsole = load('lib/sirayaConsole.ts');
const account = { id: '11111111-1111-4111-8111-111111111111' }, id = '22222222-2222-4222-8222-222222222222';
let job, user, configured, calls, receipts, denied, claimAllowed, onLookup;
function receipt(requestId, cost = 0.123456, changes = {}) {
  return actualConsole.normalizeBillingRecord({ request_id: requestId, account_id: 'fixture-provider-account', timestamp: new Date().toISOString(), model: 'SIRAYA-Seedance-2.5', cost, currency: 'USD', status: 'success', usage: { video_seconds: 4 }, performance: { latency_ms: 12345 }, ...changes });
}
function reset() {
  user = { id: 7, birth_date: '1994-09-08', adult_confirmed_at: null };
  job = { id, account_id: account.id, user_id: '7', model: 'SIRAYA-Seedance-2.5', nsfw: false, status: 'completed', provider_request_id: 'exact-request-1', provider_request_ids: ['exact-request-1'], provider_receipt_count: 1,
    submitted_at: new Date(Date.now() - 60000).toISOString(), created_at: new Date(Date.now() - 65000).toISOString(), provider_cost: null, provider_currency: null, billing_status: 'pending', billing_checked_at: null, provider_billing_outcome: null, provider_duration_ms: null };
  configured = true; denied = false; claimAllowed = true; onLookup = null; calls = []; receipts = new Map([['exact-request-1', receipt('exact-request-1')]]);
}
const db = { sql: { query: async (query, values) => {
  if (query.startsWith('select ')) return { rows: job ? [{ ...job, provider_request_ids: [...job.provider_request_ids] }] : [] };
  if (query.includes('returning id')) return { rows: claimAllowed ? [{ id }] : [] };
  if (query.includes("billing_status='matched'")) {
    if (job.provider_request_id === values[7] && JSON.stringify(job.provider_request_ids) === JSON.stringify(values[8]) && job.provider_receipt_count === values[9]) Object.assign(job, { provider_cost: values[3], provider_currency: values[4], billing_status: 'matched', billing_checked_at: new Date().toISOString(), provider_billing_outcome: values[5], provider_duration_ms: values[6] });
    return { rows: [] };
  }
  if (query.includes('set billing_status=')) {
    if (job.billing_status !== 'matched' && job.provider_request_id === values[4] && JSON.stringify(job.provider_request_ids) === JSON.stringify(values[5])) Object.assign(job, { billing_status: values[3], billing_checked_at: new Date().toISOString() });
    return { rows: [] };
  }
  throw new Error('Unexpected billing fixture query');
} } };
const helper = load('lib/businessBilling.ts', { 'server-only': {}, './db': db, './adultGate': adult, './businessTypes': { BusinessError }, './sirayaConsole': { ...actualConsole,
  consoleConfig: () => ({ configured }), fetchUsageRequest: async requestId => { calls.push(requestId); if (onLookup) onLookup(); if (!receipts.has(requestId)) throw new Error('fixture missing scoped receipt'); return receipts.get(requestId); } } });
const route = load('app/api/business/generations/[id]/billing/route.ts', { '@/lib/businessBilling': helper, '@/lib/db': db, '@/lib/businessGeneration': { publicBusinessGeneration: row => helper.publicBusinessBilling(row) }, '@/lib/business': {
  BusinessError, assertBusinessOrigin: req => { if (req.headers.get('origin') !== req.nextUrl.origin) throw new BusinessError('invalid_origin', 403); },
  requireBusiness: async () => denied ? { error: NextResponse.json({ error: { code: 'business_not_approved' } }, { status: 403 }) } : { user, account },
  readBusinessJson: async req => req.json(), businessJson: value => NextResponse.json(value, { headers: { 'cache-control': 'private, no-store' } }),
  businessErrorResponse: (_req, error) => NextResponse.json({ error: { code: error instanceof BusinessError ? error.code : 'unavailable' } }, { status: error instanceof BusinessError ? error.status : 503 }),
} });
const sync = () => helper.syncBusinessGenerationBilling(user, account, id);
const send = (body = {}, origin = 'https://thebluewing.studio') => route.POST(new NextRequest(`https://thebluewing.studio/api/business/generations/${id}/billing`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
let passed = 0;
async function test(name, run) { reset(); await run(); passed++; console.log('PASS BYOK billing: ' + name); }
(async () => {
  await test('exact owned request reconciles invoice cost, currency, status and provider latency without retail credits', async () => {
    const result = await sync(); assert.equal(result.providerCost, '0.123456'); assert.equal(result.providerCurrency, 'USD'); assert.equal(result.billingStatus, 'matched'); assert.equal(result.providerDurationMs, 12345); assert.deepEqual(calls, ['exact-request-1']);
    assert.equal(result.accountId, undefined); assert.equal(result.usage, undefined); assert.equal(result.prompt, undefined);
  });
  await test('all separately billed attempts sum in exact integer micro-units, including failed charge', async () => {
    job.provider_request_ids = ['exact-request-1', 'exact-request-2']; job.provider_request_id = 'exact-request-2'; job.provider_receipt_count = 2;
    receipts.set('exact-request-2', receipt('exact-request-2', 0.000001, { status: 'failed' }));
    const result = await sync(); assert.equal(result.providerCost, '0.123457'); assert.equal(result.providerBillingOutcome, 'mixed'); assert.equal(result.providerDurationMs, 24690); assert.equal(calls.length, 2);
  });
  await test('a confirmed zero-cost failed receipt is represented as verified zero', async () => {
    receipts.set('exact-request-1', receipt('exact-request-1', 0, { status: 'failed' })); assert.equal((await sync()).providerCost, '0.000000'); assert.equal(job.billing_status, 'matched');
  });
  await test('missing any separately billed attempt cannot become a complete or zero cost', async () => {
    job.provider_request_ids.push('unreachable-request'); job.provider_receipt_count = 2;
    const result = await sync(); assert.equal(result.providerCost, null); assert.equal(result.billingStatus, 'pending');
  });
  await test('a headerless HTTP attempt prevents a partial invoice total being called complete', async () => {
    job.provider_receipt_count = 2; const result = await sync(); assert.equal(result.billingStatus, 'unavailable'); assert.equal(result.providerCost, null); assert.equal(calls.length, 0);
  });
  await test('foreign account and user jobs are denied before Console access', async () => {
    job.account_id = 'foreign'; await assert.rejects(sync, error => error.code === 'generation_not_found'); job.account_id = account.id; job.user_id = 99; await assert.rejects(sync, error => error.code === 'generation_not_found'); assert.equal(calls.length, 0);
  });
  await test('real PostgreSQL bigint session and job IDs both arrive as strings and retain exact ownership', async () => {
    user.id = '7';
    const result = await sync(); assert.equal(result.billingStatus, 'matched'); assert.equal(result.providerCost, '0.123456');
    job.user_id = '8'; await assert.rejects(sync, error => error.code === 'generation_not_found');
  });
  await test('large bigint IDs compare without Number rounding or cross-owner collisions', async () => {
    user.id = '9007199254740992'; job.user_id = '9007199254740992'; assert.equal((await sync()).billingStatus, 'matched');
    job.user_id = '9007199254740993'; await assert.rejects(sync, error => error.code === 'generation_not_found');
  });
  await test('adult jobs check current age regardless of admin role or old confirmation flag', async () => {
    job.nsfw = true; user.birth_date = '2015-09-08'; user.adult_confirmed_at = new Date().toISOString(); user.role = 'admin'; await assert.rejects(sync, error => error.code === 'age_unverified'); assert.equal(calls.length, 0);
  });
  await test('receipt model, request ID and submission time must all match the owned job', async () => {
    for (const changed of [receipt('another-request'), receipt('exact-request-1', 0.1, { model: 'different-model' }), receipt('exact-request-1', 0.1, { timestamp: '2020-01-01T00:00:00Z' })]) {
      receipts.set('exact-request-1', changed); const result = await sync(); assert.equal(result.billingStatus, 'unavailable'); assert.equal(result.providerCost, null);
    }
  });
  await test('known NSFW alias comparison does not invent other vendor model aliases', async () => {
    job.model = 'NSFW-SIRAYA-Seedance-2.5'; assert.equal((await sync()).billingStatus, 'matched');
  });
  await test('unsupported Console account scope and missing configuration remain unknown', async () => {
    configured = false; assert.equal((await sync()).providerCost, null); assert.equal(calls.length, 0); configured = true; receipts.clear(); assert.equal((await sync()).billingStatus, 'unavailable'); assert.equal(job.provider_cost, null);
  });
  await test('a transient lookup failure never erases a verified invoice value', async () => {
    await sync(); receipts.clear(); const result = await sync(); assert.equal(result.providerCost, '0.123456'); assert.equal(result.billingStatus, 'matched');
  });
  await test('pending generation without a request ID stays pending; legacy terminal missing-ID remains unknown', async () => {
    job.provider_request_ids = []; job.provider_request_id = null; job.provider_receipt_count = 0; job.status = 'processing'; assert.equal((await sync()).billingStatus, 'pending'); job.status = 'failed'; assert.equal((await sync()).billingStatus, 'unavailable'); assert.equal(calls.length, 0);
  });
  await test('a zero-dollar receipt is not final while the asynchronous generation or billing record remains pending', async () => {
    job.status = 'processing'; receipts.set('exact-request-1', receipt('exact-request-1', 0));
    assert.equal((await sync()).billingStatus, 'pending'); assert.equal(job.provider_cost, null);
    job.status = 'completed'; receipts.set('exact-request-1', receipt('exact-request-1', 0, { status: 'processing' }));
    assert.equal((await sync()).billingStatus, 'pending'); assert.equal(job.provider_cost, null);
    receipts.set('exact-request-1', receipt('exact-request-1', 0.123456, { status: 'success' }));
    assert.equal((await sync()).providerCost, '0.123456'); assert.equal(job.billing_status, 'matched');
  });
  await test('mixed currencies are never summed or silently converted', async () => {
    job.provider_request_ids.push('request-eur'); job.provider_receipt_count = 2; receipts.set('request-eur', receipt('request-eur', 0.1, { currency: 'EUR' })); assert.equal((await sync()).providerCost, null); assert.equal(job.billing_status, 'unavailable');
  });
  await test('missing provider timing remains null rather than becoming observed or fake zero', async () => {
    receipts.set('exact-request-1', receipt('exact-request-1', 0.1, { performance: {} })); assert.equal((await sync()).providerDurationMs, null);
  });
  await test('receipt changed during lookup cannot write an obsolete invoice total', async () => {
    onLookup = () => { job.provider_request_ids = ['new-request']; job.provider_request_id = 'new-request'; job.provider_receipt_count = 2; }; assert.equal((await sync()).providerCost, null); assert.equal(job.billing_status, 'pending');
  });
  await test('concurrent/cooldown claim returns owned cached state without another Console read', async () => {
    claimAllowed = false; assert.equal((await sync()).billingStatus, 'pending'); assert.equal(calls.length, 0);
  });
  await test('actual route checks business access, same origin and rejects caller-supplied receipt IDs', async () => {
    assert.equal((await send({ requestId: 'stolen-request' })).status, 400); assert.equal((await send({}, 'https://attacker.invalid')).status, 403); denied = true; assert.equal((await send()).status, 403); assert.equal(calls.length, 0);
  });
  await test('actual route returns only scoped private billing DTO', async () => {
    const response = await send(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private.*no-store/); const body = await response.json(); assert.equal(body.generation.providerCost, '0.123456'); assert.equal(JSON.stringify(body).includes('fixture-provider-account'), false);
  });
  console.log(`PASS ${passed} BYOK invoice reconciliation/ownership/route cases; no network, credentials, paid calls or consumer credit coupling.`);
})().catch(error => { console.error('FAIL BYOK billing:', error.stack); process.exitCode = 1; });
