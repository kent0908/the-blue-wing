/** Actual opaque grants + actual route/Sharp validation, mocked DB/private Blob only. No network, credentials or paid calls. */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { NextRequest } = require('next/server');
function load(file, mocks = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), loaded, loaded.exports);
  return loaded.exports;
}
const { BusinessError } = load('lib/businessTypes.ts');
const adult = load('lib/adultGate.ts', { './i18n/k': { k: text => text } });
const accountId = '11111111-1111-4111-8111-111111111111';
const credentialId = '22222222-2222-4222-8222-222222222222';
const foreignId = '33333333-3333-4333-8333-333333333333';
const TEST_KEY = Buffer.alloc(32, 73).toString('base64');
process.env.BYOK_ENCRYPTION_KEY = TEST_KEY;
let authorization, assets, queryCalls, blobCalls, blobType, blobSize, blobBytes, blobLength, cancelled, missing, broken;
let fixture;
const source = {
  sql: { query: async (query, values) => {
    queryCalls.push({ query, values });
    if (query.includes('from business_accounts')) return { rows: authorization ? [authorization] : [] };
    if (query.includes('from assets')) {
      const wanted = Array.isArray(values[1]) ? values[1] : [values[1]];
      return { rows: assets.filter(asset => wanted.includes(Number(asset.id))) };
    }
    throw new Error('unexpected fixture query');
  } },
};
const blob = { get: async (pathname, options) => {
  blobCalls.push({ pathname, options });
  if (broken) throw new Error('private-store-error-must-not-leak');
  if (missing) return null;
  let offset = 0;
  return { statusCode: 200, blob: { contentType: blobType, size: blobSize }, headers: new Headers(blobLength === null ? {} : { 'content-length': blobLength }),
    stream: new ReadableStream({ pull(controller) {
      if (offset === blobBytes.length) { controller.close(); return; }
      const end = Math.min(offset + 32 * 1024, blobBytes.length);
      controller.enqueue(blobBytes.subarray(offset, end)); offset = end;
    }, cancel() { cancelled++; } }),
  };
} };
const references = load('lib/businessReferenceUrls.ts', { 'server-only': {}, '@vercel/blob': blob, './db': source,
  './assets': { assetPathPrefix: id => `assets/${id}/` }, './adultGate': adult, './businessTypes': { BusinessError }, './seo/site': { SITE_URL: 'https://thebluewing.studio' } });
const route = load('app/api/business/references/[token]/route.ts', { '@/lib/businessReferenceUrls': references, '@/lib/businessTypes': { BusinessError } });
const create = (ids = [1], nsfw = false, user = 7, account = accountId, credential = credentialId) => references.createBusinessReferenceUrls(user, account, credential, ids, nsfw);
const tokenOf = reference => new URL(reference.url).pathname.split('/').at(-1);
const fetchToken = token => route.GET(new NextRequest(`https://thebluewing.studio/api/business/references/${token}`, { headers: { authorization: 'not-forwarded', cookie: 'not-required', range: 'bytes=0-4' } }), { params: Promise.resolve({ token }) });
function reset() {
  authorization = { account_id: accountId, user_id: '7', account_status: 'approved', credential_id: credentialId, is_active: true, revoked_at: null, user_status: 'active', email_verified: true, birth_date: '1994-09-08', adult_confirmed_at: null };
  assets = [{ id: '1', user_id: '7', pathname: 'assets/7/fixture.png', content_type: 'image/png', size: String(fixture.length) }];
  queryCalls = []; blobCalls = []; cancelled = 0; blobType = 'image/png'; blobSize = fixture.length; blobBytes = fixture; blobLength = String(fixture.length); missing = false; broken = false;
  process.env.BYOK_ENCRYPTION_KEY = TEST_KEY;
}
let passed = 0;
async function test(name, run) { reset(); await run(); passed++; console.log(`PASS reference grants: ${name}`); }
async function denied(token, status = 404, noLookup = false) {
  const queries = queryCalls.length, reads = blobCalls.length;
  const response = await fetchToken(token);
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(await response.json(), { error: { code: status >= 500 ? 'unavailable' : 'not_found' } });
  assert.equal(blobCalls.length, reads, 'access rejection must occur before storage read');
  if (noLookup) assert.equal(queryCalls.length, queries, 'invalid grants must never reach the database');
}
(async () => {
  fixture = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#246899' } }).png().toBuffer();
  await test('server-fixed origin, opaque randomized grants, current approval, one batch ownership query and ordered roles', async () => {
    assets = [2, 1].map(id => ({ ...assets[0], id: String(id) }));
    const first = await create([1, 2]);
    const second = await create([1, 2]);
    assert.deepEqual(first.map(reference => reference.type), ['image', 'image']);
    assert.deepEqual(first.map(reference => reference.role), ['reference_image', 'reference_image']);
    assert.notEqual(first[0].url, second[0].url);
    assert.equal(queryCalls.length, 6);
    assert.equal(blobCalls.length, 4, 'each image is decoded in the preflight before grants or paid submission');
    for (const reference of first) {
      const url = new URL(reference.url);
      assert.equal(url.origin, 'https://thebluewing.studio'); assert.equal(url.search, '');
      assert.match(url.pathname, /^\/api\/business\/references\/[A-Za-z0-9_-]+$/);
      assert.equal(reference.url.includes(accountId), false); assert.equal(reference.url.includes(credentialId), false);
      assert.equal(reference.url.includes('assets/7'), false); assert.equal(reference.url.includes(TEST_KEY), false);
    }
  });
  await test('PostgreSQL bigint session strings mint numeric-compatible grants and pass actual source GET', async () => {
    const refs = await create([1], false, '7');
    assert.equal(queryCalls[0].values[1], 7);
    assert.equal(queryCalls[1].values[0], 7);
    const response = await fetchToken(tokenOf(refs[0]));
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture);
    assert.equal(queryCalls.at(-1).values[0], 7);
  });
  await test('noncanonical and unsafe bigint owner IDs fail before database or Blob reads', async () => {
    for (const id of ['0','07',' 7','7 ','7.0','7e0','9007199254740992',9007199254740992,{},null,Infinity,-1]) {
      await assert.rejects(() => create([1], false, id), error => error.code === 'invalid_reference');
    }
    assert.equal(queryCalls.length, 0); assert.equal(blobCalls.length, 0);
  });
  await test('30 references and >20MB aggregate real bytes are accepted with sequential preflight and no Base64 batch cap', async () => {
    assets = Array.from({ length: 30 }, (_, index) => ({ ...assets[0], id: String(index + 1), size: String(1024 * 1024) }));
    blobBytes = Buffer.concat([fixture, Buffer.alloc(1024 * 1024 - fixture.length)]); blobSize = blobBytes.length; blobLength = String(blobBytes.length);
    assert.equal((await create(assets.map(asset => Number(asset.id)))).length, 30);
    assert.equal(queryCalls.length, 3); assert.equal(blobCalls.length, 30);
  });
  await test('invalid input, duplicate, oversized count and malformed binding are rejected before DB', async () => {
    for (const ids of [[1, 1], [0], [-1], [1.5], ['1'], Array.from({ length: 31 }, (_, i) => i + 1)]) await assert.rejects(() => create(ids), error => error.code === 'invalid_reference');
    await assert.rejects(() => create([1], false, 0)); await assert.rejects(() => create([1], false, 7, 'bad')); await assert.rejects(() => create([1], false, 7, accountId, 'bad'));
    assert.equal(queryCalls.length, 0); assert.deepEqual(await create([]), []);
  });
  await test('creator validates owner, registered raster MIME, <30MB and safe own pathname', async () => {
    for (const changes of [{ user_id: 99 }, { content_type: 'image/svg+xml' }, { size: 30 * 1024 * 1024 }, { size: 0 }, { pathname: 'assets/99/photo.png' }, { pathname: 'assets/7/../99/a.png' }, { pathname: 'assets/7/a//b.png' }, { pathname: 'https://attacker.invalid/a.png' }, { pathname: 'assets/7/a.png?secret=1' }]) {
      assets[0] = { id: '1', user_id: '7', pathname: 'assets/7/fixture.png', content_type: 'image/png', size: fixture.length, ...changes };
      await assert.rejects(() => create(), error => error.code === 'invalid_reference');
    }
    assert.equal(blobCalls.length, 0);
  });
  await test('cookie-free actual GET validates image bytes/dimensions and only fetches its owned private pathname', async () => {
    const token = tokenOf((await create())[0]); const response = await fetchToken(token);
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture);
    assert.equal(response.headers.get('content-type'), 'image/png'); assert.equal(response.headers.get('content-length'), String(fixture.length));
    assert.match(response.headers.get('cache-control'), /private.*no-store/); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive'); assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(blobCalls[0].pathname, 'assets/7/fixture.png'); assert.equal(blobCalls[0].options.access, 'private'); assert.equal(blobCalls[0].options.useCache, false);
    assert.equal(blobCalls[0].options.headers, undefined, 'cookies, authorization and range headers must never be forwarded');
  });
  await test('tamper, malformed envelope, alternate alphabet and wrong version never hit DB/Blob', async () => {
    const token = tokenOf((await create())[0]);
    for (const invalid of ['', 'x', token + '=', token.slice(0, -1), token.slice(0, -10) + (token.at(-10) === 'A' ? 'B' : 'A') + token.slice(-9), 'A'.repeat(1025), (token[0] === 'A' ? 'B' : 'A') + token.slice(1)]) await denied(invalid, 404, true);
  });
  await test('grant expires after 60 minutes, checked before DB/Blob', async () => {
    const token = tokenOf((await create())[0]); const originalNow = Date.now;
    try { const now = originalNow(); Date.now = () => now + 3600 * 1000; await denied(token, 404, true); }
    finally { Date.now = originalNow; }
  });
  await test('clock-future grants are rejected before DB/Blob', async () => {
    const originalNow = Date.now; let token;
    try { const now = originalNow(); Date.now = () => now + 10_000; token = tokenOf((await create())[0]); }
    finally { Date.now = originalNow; }
    await denied(token, 404, true);
  });
  await test('cross-account, cross-user and pinned credential mismatch fail closed', async () => {
    const token = tokenOf((await create())[0]);
    for (const change of [{ account_id: foreignId }, { user_id: '9' }, { credential_id: foreignId }]) {
      const previous = { ...authorization }; Object.assign(authorization, change); await denied(token); authorization = previous;
    }
  });
  await test('normal key rotation preserves an issued grant but cannot mint more grants with the retired version', async () => {
    const token = tokenOf((await create())[0]);
    authorization.is_active = false;
    const response = await fetchToken(token);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture);
    const before = blobCalls.length;
    await assert.rejects(() => create(), error => error.code === 'invalid_reference');
    assert.equal(blobCalls.length, before, 'retired credential cannot issue new grants or read source bytes during issuance');
    authorization.revoked_at = new Date().toISOString();
    await denied(token);
  });
  await test('revoked, suspended, unapproved, banned and unverified current state deny existing grants', async () => {
    const token = tokenOf((await create())[0]);
    for (const change of [{ revoked_at: new Date().toISOString() }, { account_status: 'suspended' }, { account_status: 'pending' }, { user_status: 'banned' }, { email_verified: false }]) {
      const previous = { ...authorization }; Object.assign(authorization, change); await denied(token); authorization = previous;
    }
  });
  await test('NSFW grants recheck actual age; historical adult flag and admin role cannot bypass it', async () => {
    const token = tokenOf((await create([1], true))[0]);
    authorization.birth_date = '2015-09-08'; authorization.adult_confirmed_at = new Date().toISOString(); authorization.role = 'admin';
    await denied(token); await assert.rejects(() => create([1], true));
  });
  await test('foreign/deleted asset and modified unsafe DB pathname are rejected before private Blob', async () => {
    const token = tokenOf((await create())[0]);
    const previous = assets[0]; assets[0] = { ...previous, user_id: 99 }; await denied(token);
    assets[0] = { ...previous, pathname: 'https://attacker.invalid/a' }; await denied(token);
    assets = []; await denied(token);
  });
  await test('actual PNG/JPEG/WebP/GIF decoder metadata are accepted', async () => {
    for (const [format, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp'], ['gif', 'image/gif']]) {
      const bytes = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#5a8aaf' } })[format]().toBuffer();
      assets[0] = { ...assets[0], content_type: mime, size: bytes.length }; blobType = mime; blobSize = bytes.length; blobBytes = bytes; blobLength = String(bytes.length);
      const response = await fetchToken(tokenOf((await create())[0])); assert.equal(response.status, 200, mime); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
  });
  await test('actual undersized image, out-of-range ratio and spoofed image magic are denied before HTTP 200', async () => {
    const token = tokenOf((await create())[0]);
    const inputs = [await sharp({ create: { width: 299, height: 300, channels: 3, background: '#5a8aaf' } }).png().toBuffer(),
      await sharp({ create: { width: 300, height: 1000, channels: 3, background: '#5a8aaf' } }).png().toBuffer(),
      await sharp({ create: { width: 6001, height: 300, channels: 3, background: '#5a8aaf' } }).png().toBuffer(),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])];
    for (const bytes of inputs) {
      assets[0].size = bytes.length; blobBytes = bytes; blobSize = bytes.length; blobLength = String(bytes.length);
      await assert.rejects(() => create(), error => error.code === 'invalid_reference', 'invalid image cannot receive a grant or reach a paid submission');
      const response = await fetchToken(token); assert.equal(response.status, 404); assert.equal((await response.json()).error.code, 'not_found');
    }
  });
  await test('Blob declared MIME/size/content-length mismatch cancels source and sanitizes failure', async () => {
    const token = tokenOf((await create())[0]);
    for (const mutate of [() => { blobType = 'text/html'; }, () => { blobSize = fixture.length + 1; }, () => { blobLength = '999999'; }]) {
      blobType = 'image/png'; blobSize = fixture.length; blobLength = String(fixture.length); mutate();
      assert.equal((await fetchToken(token)).status, 404);
    }
    assert.equal(cancelled, 3);
  });
  await test('actual truncated or overflowing stream is rejected while bounded, even when metadata lies', async () => {
    const token = tokenOf((await create())[0]);
    blobCalls = [];
    blobBytes = fixture.subarray(0, fixture.length - 1); assert.equal((await fetchToken(token)).status, 404);
    blobBytes = Buffer.concat([fixture, Buffer.from([1])]); assert.equal((await fetchToken(token)).status, 404);
    assert.equal(blobCalls.length, 2, 'both malformed streams were actually read and rejected');
  });
  await test('key rotation invalidates old token cryptography without any database or Blob access', async () => {
    const token = tokenOf((await create())[0]); process.env.BYOK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64'); await denied(token, 404, true);
  });
  await test('missing encryption config and storage exceptions expose only sanitized errors', async () => {
    const token = tokenOf((await create())[0]);
    process.env.BYOK_ENCRYPTION_KEY = ''; await denied(token, 503, true);
    process.env.BYOK_ENCRYPTION_KEY = TEST_KEY; broken = true;
    const response = await fetchToken(token); assert.equal(response.status, 503); assert.equal(JSON.stringify(await response.json()).includes('private-store-error'), false);
    broken = false; missing = true; assert.equal((await fetchToken(token)).status, 404);
  });
  console.log(`PASS business reference URLs: ${passed} actual grant/route/security cases, fresh owner/account/credential/age checks, real image decoder, zero network or paid calls.`);
})().catch(error => { console.error('FAIL business reference URLs:', error.stack); process.exitCode = 1; });
