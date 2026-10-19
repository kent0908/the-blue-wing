/** Real private-media handler + real business approval guard. Mock storage/session; no network or paid calls. */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
function load(file, mocks = {}) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), module, module.exports);
  return module.exports;
}
const types = load('lib/businessTypes.ts');
const adult = load('lib/adultGate.ts', { './i18n/k': { k: s => s } });
const accountId = 'b4d2ce20-929b-4c8e-bb6e-a372636b1d9e';
let user = { id: 7, role: 'user', birth_date: null, adult_confirmed_at: null };
let status = 'approved';
let lookups = 0;
let fetches = [];
let sourceType = 'video/mp4';
let rangeResponse = false;
let throwStorage = false;
let missingStorage = false;
let cancelled = 0;
const business = load('lib/business.ts', {
  'server-only': {}, './businessTypes': types, './businessSecrets': {}, './adultGate': adult,
  './i18n/server': { localeFromRequest: () => 'en' },
  './apiauth': { requireUser: async () => user ? { user } : { error: NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 }) } },
  './db': { sql: async () => { lookups++; return { rows: [{ id: accountId, user_id: 7, company_name: 'Media fixture', use_case: 'Private output ownership check', status, review_note: null, created_at: '2026-10-19T00:00:00.000Z', updated_at: '2026-10-19T00:00:00.000Z' }] }; } },
});
const route = load('app/api/business/media/[...path]/route.ts', {
  '@/lib/business': business,
  '@vercel/blob': { get: async (path, options) => {
    fetches.push({ path, options });
    if (throwStorage) throw new Error('private-storage-internal-error');
    if (missingStorage) return null;
    return {
      statusCode: 200,
      blob: { contentType: sourceType, size: 50 },
      headers: new Headers(rangeResponse ? { 'content-range': 'bytes 0-3/50', 'content-length': '4' } : { 'content-length': '4' }),
      stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4])); controller.close(); }, cancel() { cancelled++; } }),
    };
  } },
});
const context = (category = 'standard', owner = accountId, file = 'frame.mp4') => ({ params: Promise.resolve({ path: [owner, category, file] }) });
const request = (headers = {}, query = '') => new NextRequest(`https://test.example/api/business/media/${accountId}/standard/frame.mp4${query}`, { headers });
async function expectDenied(promise, expected, code) {
  const before = fetches.length;
  const response = await promise;
  assert.equal(response.status, expected);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await response.json()).error.code, code);
  assert.equal(fetches.length, before, 'denied media request never reaches storage');
}
(async () => {
  user = null;
  await expectDenied(route.GET(request(), context()), 401, 'unauthorized');
  user = { id: 7, role: 'user', birth_date: null, adult_confirmed_at: null };
  status = 'pending';
  await expectDenied(route.GET(request(), context()), 403, 'business_not_approved');
  status = 'approved';
  await expectDenied(route.GET(request(), context('standard', '9005baf5-b326-48ed-beee-36701f4c7518')), 404, 'not_found');
  await expectDenied(route.GET(request(), context('adult')), 403, 'age_unverified');
  for (const file of ['..', '.', 'frame.mp4\r\nX-Injected:yes', 'a/b.mp4', 'name;unsafe.mp4']) await expectDenied(route.GET(request(), context('standard', accountId, file)), 400, 'invalid_media_path');
  await expectDenied(route.GET(request(), context('public')), 400, 'invalid_media_path');
  for (const range of ['bytes=0-9,10-19', 'items=0-3', 'bytes=-', 'bytes=abc', 'bytes=1-0', 'bytes=-0', 'bytes=9007199254740992-', 'bytes=-9007199254740992']) await expectDenied(route.GET(request({ range }), context()), 416, 'invalid_range');
  const response = await route.GET(request({ authorization: 'must-not-forward', 'x-custom-header': 'must-not-forward' }), context());
  assert.equal(response.status, 200);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="frame.mp4"');
  assert.deepEqual(fetches.at(-1), { path: `business/${accountId}/standard/frame.mp4`, options: { access: 'private' } });
  rangeResponse = true;
  const partial = await route.GET(request({ range: 'bytes=0-3' }), context());
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 0-3/50');
  assert.equal(partial.headers.get('content-length'), '4');
  assert.deepEqual(fetches.at(-1).options, { access: 'private', headers: { Range: 'bytes=0-3' } });
  await partial.arrayBuffer();
  rangeResponse = false;
  const download = await route.GET(request({}, '?download=1'), context());
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="frame.mp4"');
  await download.arrayBuffer();
  user.birth_date = '1994-09-08';
  const adultResponse = await route.GET(request(), context('adult'));
  assert.equal(adultResponse.status, 200);
  assert.equal(fetches.at(-1).path, `business/${accountId}/adult/frame.mp4`);
  await adultResponse.arrayBuffer();
  user.birth_date = '2015-09-08';
  user.adult_confirmed_at = '2026-10-19T00:00:00.000Z';
  await expectDenied(route.GET(request(), context('adult')), 403, 'age_unverified');
  user.role = 'admin';
  status = 'suspended';
  await expectDenied(route.GET(request(), context()), 403, 'business_suspended');
  status = 'rejected';
  await expectDenied(route.GET(request(), context()), 403, 'business_not_approved');
  status = 'approved';
  sourceType = 'text/html';
  const unsupported = await route.GET(request(), context());
  assert.equal(unsupported.status, 415);
  assert.equal(cancelled, 1, 'unsupported source stream is cancelled');
  sourceType = 'image/png';
  const image = await route.GET(request(), context('standard', accountId, 'frame.png'));
  assert.equal(image.status, 200);
  await image.arrayBuffer();
  missingStorage = true;
  const absent = await route.GET(request(), context());
  assert.equal(absent.status, 404);
  missingStorage = false;
  throwStorage = true;
  const safeError = await route.GET(request(), context());
  assert.equal(safeError.status, 503);
  assert.equal(JSON.stringify(await safeError.json()).includes('private-storage-internal-error'), false);
  assert.ok(lookups >= 15, 'approval and current age are looked up for each valid request');
  console.log('PASS business media: actual approval/age guard on every request, no administrator bypass, owner isolation, suspension, private streams, bounded range syntax, attachment download, source content-type checks, sanitised failures and zero storage reads on rejected access. No network or paid calls.');
})().catch(error => { console.error('FAIL business media fixture:', error.stack); process.exitCode = 1; });
