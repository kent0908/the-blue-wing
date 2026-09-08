// Executes real route handlers, access/safety guards and error formatting.
// Auth, database, billing and generation providers are in-memory mocks only.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const cache = new Map();
let counts;
const reset = () => { counts = { credit: 0, paid: 0, provider: 0, db: 0 }; };
const mocks = {
  'next/server': { NextRequest, NextResponse },
  '@/lib/apiauth': { requireUser: async () => ({ user: { id: 7 } }) },
  '@/lib/credits': { creditCost: async () => { counts.credit++; return 36; }, getBalance: async () => 100 },
  '@/lib/creditTransactions': { paidCall: async (u, c, k, r, fn) => { counts.paid++; return { result: await fn(), chargeId: 'mock-charge' }; }, refundCharge: async () => {} },
  '@/lib/assetData': { assetsToDataUrls: async () => [] },
  '@/lib/mediaStore': { persistGeneratedMedia: async () => '/mock-media' },
  '@/lib/generations': { recordGeneration: async () => {} },
  '@/lib/db': { sql: async () => { counts.db++; return { rows: [{ n: 0 }] }; } },
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const m = { exports: {} };
  cache.set(file, m);
  const requireLocal = id => {
    if (id in mocks) return mocks[id];
    const local = id.startsWith('@/') ? path.resolve(id.slice(2)) : id.startsWith('.') ? path.resolve(path.dirname(file), id) : null;
    if (!local) return require(id);
    return load(local + '.ts');
  };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(requireLocal, m, m.exports);
  return m.exports;
}
// Preserve the production error class identity, but never invoke a live provider.
const provider = load('lib/siraya.ts');
mocks['@/lib/siraya'] = {
  ...provider,
  createImage: async () => { counts.provider++; return { data: [{ url: 'https://example.invalid/mock.png' }] }; },
  createVideo: async () => { counts.provider++; return { id: 'mock-job' }; },
};
const { authorizeSceneRequest, assertModelAccess } = load('lib/companionGenerationAccess.ts');
const checks = [];
async function test(name, fn) { reset(); await fn(); checks.push(name); console.log('PASS ' + name); }
function request(kind, model, extra = {}, headers = {}) {
  return new NextRequest('https://test.invalid/api/' + kind, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ model, prompt: 'An adult explorer walking through a quiet forest', ...extra }) });
}
function untouched() { assert.deepEqual(counts, { credit: 0, paid: 0, provider: 0, db: 0 }); }
(async () => {
  for (const kind of ['images', 'videos']) {
    const route = load('app/api/' + kind + '/route.ts');
    const model = kind === 'images' ? 'Seedream-4.0' : 'SIRAYA-Seedance-2.0-mini';
    const nsfw = kind === 'images' ? 'NSFW-Seedream-5.0-pro' : 'NSFW-Seedance-2.0-mini';
    await test(kind + ': general NSFW request rejected before billing/provider', async () => {
      const response = await route.POST(request(kind, nsfw)); assert.equal(response.status, 403); untouched();
    });
    await test(kind + ': forged scene/admin headers cannot authorize NSFW', async () => {
      const response = await route.POST(request(kind, nsfw, {}, { 'x-blue-wing-companion-scene': 'true', 'x-blue-wing-scene-authorized': 'true', 'x-admin': 'true', 'x-blue-wing-expected-credits': '36' }));
      assert.equal(response.status, 403); untouched();
    });
    await test(kind + ': forged scene body cannot authorize NSFW', async () => {
      const response = await route.POST(request(kind, nsfw, { companionScene: true, sceneId: 1 })); assert.equal(response.status, 403); untouched();
    });
    for (const [field, value] of [['prompt', 'A child in a forest'], ['prompt', 'c.o.c.a.i.n.e'], ['negative_prompt', 'no children']]) {
      await test(kind + ': unsafe ' + field + ' blocked before billing/provider (' + value + ')', async () => {
        const response = await route.POST(request(kind, model, { [field]: value })); assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'prompt_blocked'); untouched();
      });
    }
    await test(kind + ': safe general request reaches billing/provider once', async () => {
      const response = await route.POST(request(kind, model)); assert.equal(response.status, 200); assert.equal(counts.paid, 1); assert.equal(counts.provider, 1);
    });
    await test(kind + ': exact server-authorized scene request permits NSFW', async () => {
      const req = request(kind, nsfw); assert.equal(authorizeSceneRequest(req), req);
      const response = await route.POST(req); assert.equal(response.status, 200); assert.equal(counts.paid, 1); assert.equal(counts.provider, 1);
    });
    await test(kind + ': scene authorization never bypasses prompt safety', async () => {
      const response = await route.POST(authorizeSceneRequest(request(kind, nsfw, { prompt: 'children' })));
      assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'prompt_blocked'); untouched();
    });
    await test(kind + ': cloning authorized request loses authorization', async () => {
      const req = authorizeSceneRequest(request(kind, nsfw)); const response = await route.POST(new NextRequest(req));
      assert.equal(response.status, 403); untouched();
    });
  }
  await test('NSFW model recognition is case-insensitive', () => { assert.throws(() => assertModelAccess({}, 'nSfW-Seedream-5.0-pro'), e => e.status === 403); });
  console.log(`Generation access: ${checks.length} passed; real guards and routes, mocked external effects; no real credits or media generation.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
