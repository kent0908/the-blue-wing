/* Actual read-only BYOK assets helper and route; all external services are fixtures. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
const originalFetch = global.fetch;
const OWN_KEY = 'sk-fixture-owned-key-1234567890';
let calls = [], approved = true, keyPresent = true, active = 0, maxActive = 0, reply;
class NextRequest extends Request { get nextUrl() { return new URL(this.url); } }
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private,no-store' } });
let BusinessError;
const business = {
  businessJson: json,
  businessErrorResponse: (_request, error) => json({ error: { code: error.code || 'unavailable', message: 'Sanitized' } }, error.status || 503),
  requireBusiness: async () => approved ? { user: { id: 7 }, account: { id: 'owned-account' } } : { error: json({ error: { code: 'business_not_approved' } }, 403) },
  getBusinessCredential: async (user, account) => {
    assert.equal(user, 7); assert.equal(account, 'owned-account');
    return keyPresent ? { id: 'owned-credential', apiKey: OWN_KEY } : null;
  },
};
function load(file) {
  const full = path.resolve(root, file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} }; cache.set(full, module);
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  function localRequire(specifier) {
    if (specifier === 'server-only') return {};
    if (specifier === '@/lib/business') return business;
    if (specifier.startsWith('@/')) return load(specifier.slice(2) + '.ts');
    if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(full), specifier + '.ts')));
    return require(specifier);
  }
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
  return module.exports;
}
const assets = load('lib/businessProviderAssets.ts');
BusinessError = load('lib/businessTypes.ts').BusinessError;
const route = load('app/api/business/provider-assets/route.ts');
const get = (query = '') => route.GET(new NextRequest('https://fixture.invalid/api/business/provider-assets' + query));
const row = (id, type = 'image', status = 'active') => ({ assetId: id, type, status, name: id + '.png', url: 'https://signed.invalid/SECRET', assetUri: 'asset://' + id, groupId: 'private-group', extra: OWN_KEY });
const listReply = (items, total = items.length) => json({ isSuccess: true, data: { items }, pagination: { page: 1, pageSize: 50, total, totalPages: 1 } });
const singleReply = (id, type = 'image', status = 'active') => json({ isSuccess: true, data: row(id, type, status) });
function reset() {
  calls = []; approved = keyPresent = true; active = maxActive = 0;
  reply = async url => url.pathname.endsWith('/assets') ? listReply([row('asset-own-1')]) : singleReply(url.pathname.split('/').at(-1));
  global.fetch = async (input, init) => {
    const url = new URL(input);
    calls.push({ url: String(url), init });
    assert.equal(url.origin, 'https://console-api.siraya.ai');
    assert.ok(url.pathname === '/extapi/v1/assets' || /^\/extapi\/v1\/assets\/[A-Za-z0-9_-]+$/.test(url.pathname));
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, 'Bearer ' + OWN_KEY);
    assert.ok(!url.searchParams.has('groupId')); assert.ok(init.signal instanceof AbortSignal);
    active++; maxActive = Math.max(active, maxActive);
    try { return await reply(url, init); } finally { active--; }
  };
}
let total = 0;
async function test(name, run) { reset(); await run(); total++; console.log('PASS ' + name); }
const rejects = (fn, code = 'invalid_reference') => assert.rejects(fn, error => error instanceof BusinessError && error.code === code && !error.message.includes(OWN_KEY));
(async () => {
  await test('approval is checked before metadata or provider access', async () => {
    approved = false; const response = await get(); assert.equal(response.status, 403); assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(calls.length, 0);
  });
  await test('a missing current key returns an empty needsKey state without any fallback', async () => {
    keyPresent = false; const response = await get(); assert.equal(response.status, 200); assert.equal((await response.json()).needsKey, true); assert.equal(calls.length, 0);
  });
  await test('list uses only the current account key and returns safe metadata with pagination', async () => {
    const response = await get('?page=2&pageSize=20&assetType=video&name=scene');
    const body = await response.json(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(body.assets, [{ id: 'asset-own-1', name: 'asset-own-1.png', type: 'image', status: 'active' }]);
    assert.deepEqual(body.pagination, { page: 2, pageSize: 20, total: 1, totalPages: 1 });
    assert.equal(body.needsKey, false);
    const sent = new URL(calls[0].url); assert.equal(sent.searchParams.get('status'), 'active'); assert.equal(sent.searchParams.get('assetType'), 'video');
    const text = JSON.stringify(body); for (const secret of [OWN_KEY, 'signed.invalid', 'private-group', 'assetUri', 'url']) assert.ok(!text.includes(secret));
  });
  await test('invalid, repeated and unknown query fields fail before provider I/O', async () => {
    for (const query of ['?page=0', '?page=-1', '?page=1.2', '?page=100001', '?page=1e2', '?pageSize=101', '?pageSize=0', '?page=1&page=2', '?status=unknown', '?assetType=html', '?name=' + 'x'.repeat(121), '?groupId=foreign', '?url=https://evil.invalid', '?apiKey=anything']) assert.equal((await get(query)).status, 400, query);
    assert.equal(calls.length, 0);
  });
  await test('direct list callers cannot exceed the 100 item page boundary', async () => {
    await rejects(() => assets.listBusinessProviderAssets({ page: 1, pageSize: 101 }, { apiKey: OWN_KEY }), 'invalid_parameters'); assert.equal(calls.length, 0);
    reply = async () => listReply(Array.from({ length: 100 }, (_, index) => row('a-' + index)), 201);
    const result = await assets.listBusinessProviderAssets({ page: 1, pageSize: 100 }, { apiKey: OWN_KEY }); assert.equal(result.assets.length, 100); assert.equal(result.pagination.totalPages, 3);
  });
  await test('feature inactive and permission errors are sanitized optional asset failures', async () => {
    reply = async () => json({ isSuccess: false, error: { code: 'FEATURE_INACTIVE', message: OWN_KEY + ' private details' } }, 403);
    const response = await get(); const body = await response.json(); assert.equal(response.status, 503); assert.equal(body.error.code, 'business_asset_unavailable'); assert.ok(!JSON.stringify(body).includes(OWN_KEY)); assert.equal(calls.length, 1);
  });
  await test('timeouts, redirects and provider errors never follow external media or retry another key', async () => {
    for (const fixture of [async () => { throw new TypeError(OWN_KEY); }, async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } }), async () => json({ error: OWN_KEY }, 500)]) {
      reset(); reply = fixture; const response = await get(); assert.equal(response.status, 503); assert.equal(calls.length, 1); assert.ok(!JSON.stringify(await response.json()).includes(OWN_KEY));
    }
  });
  await test('unreadable and unbounded JSON responses are rejected', async () => {
    for (const fixture of [() => new Response('<html>'), () => new Response('x'.repeat(262145)), () => json({ isSuccess: true, data: { items: [row('a-1')] } }), () => listReply([row('a-1'), row('a-1')])]) {
      reset(); reply = async () => fixture(); assert.equal((await get()).status, 503);
    }
  });
  await test('all 50 references resolve in order with at most four read-only requests in flight', async () => {
    const references = Array.from({ length: 50 }, (_, index) => ({ id: 'asset-' + index, type: ['image', 'video', 'audio'][index % 3] }));
    reply = async url => { await new Promise(resolve => setTimeout(resolve, 2)); const id = url.pathname.split('/').at(-1); return singleReply(id, references.find(reference => reference.id === id).type); };
    const result = await assets.resolveBusinessProviderAssets(references, { apiKey: OWN_KEY });
    assert.equal(result.length, 50); assert.equal(calls.length, 50); assert.ok(maxActive <= 4); assert.ok(maxActive >= 2);
    assert.deepEqual(result, references.map(reference => ({ type: reference.type, url: 'asset://' + reference.id, role: 'reference_' + reference.type })));
    assert.ok(!JSON.stringify(result).includes('signed.invalid'));
  });
  await test('opaque ID, count, uniqueness, type and unexpected fields are checked before fetch', async () => {
    for (const references of [Array.from({ length: 51 }, (_, index) => ({ id: 'a-' + index, type: 'image' })), [{ id: 'a-1', type: 'image' }, { id: 'a-1', type: 'video' }], [{ id: 'asset://a-1', type: 'image' }], [{ id: '../a-1', type: 'image' }], [{ id: 'a?secret', type: 'image' }], [{ id: 'a'.repeat(201), type: 'image' }], [{ id: 'a-1', type: 'html' }], [{ id: 'a-1', type: 'image', url: 'https://evil.invalid' }], [null]]) await rejects(() => assets.resolveBusinessProviderAssets(references, { apiKey: OWN_KEY }));
    assert.equal(calls.length, 0);
  });
  await test('empty references perform no I/O', async () => {
    assert.deepEqual(await assets.resolveBusinessProviderAssets([], { apiKey: OWN_KEY }), []); assert.equal(calls.length, 0);
  });
  await test('foreign, missing, inactive, changed-type and mismatched-ID references fail closed', async () => {
    for (const fixture of [() => json({ isSuccess: false, error: { message: OWN_KEY } }, 404), () => singleReply('a-other'), () => singleReply('a-1', 'video'), () => singleReply('a-1', 'image', 'processing'), () => singleReply('a-1', 'image', 'failed')]) {
      reset(); reply = async () => fixture(); await rejects(() => assets.resolveBusinessProviderAssets([{ id: 'a-1', type: 'image' }], { apiKey: OWN_KEY })); assert.equal(calls.length, 1);
    }
  });
  await test('console tokens or absent credentials cannot activate any provider or platform fallback', async () => {
    for (const apiKey of ['', 'csk-fixture-console-token-1234567890', undefined]) await rejects(() => assets.resolveBusinessProviderAssets([{ id: 'a-1', type: 'image' }], { apiKey }), 'credential_unavailable'); assert.equal(calls.length, 0);
  });
  await test('asset errors never echo raw provider rows or credential prose', async () => {
    reply = async () => json({ isSuccess: false, data: { apiKey: OWN_KEY, url: 'https://secret.invalid' } });
    await rejects(() => assets.resolveBusinessProviderAssets([{ id: 'a-1', type: 'image' }], { apiKey: OWN_KEY }), 'business_asset_unavailable');
  });
  console.log(`business provider assets: ${total} passed; zero real network, database or paid generation calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
