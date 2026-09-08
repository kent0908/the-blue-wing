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

let payload;
mocks['@/lib/siraya'].createVideo=async b=>{payload=b;counts.provider++;return {id:'mock-job'}};
mocks['@/lib/generationAssetUrls']={createGenerationAssetUrls:async(u,ids)=>ids.map(id=>'https://trusted.invalid/'+id)};
mocks['@/lib/providerAssets']={resolveProviderAssetReferences:async(u,ids)=>{assert.equal(u,7);return ids.map(id=>({type:'image',url:'asset://owned-'+id,role:'reference_image'}))}};
(async()=>{
 const route=load('app/api/videos/route.ts');
 await test('first-last maps only frame_images and adaptive for 2.5',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.5',{generationMode:'first-last-frame',assetIds:[1,2],seconds:4,resolution:'720p'}));assert.equal(r.status,200);assert.equal(payload.frame_images.length,2);assert.equal(payload.frame_images[0].frame_type,'first_frame');assert.equal(payload.aspect_ratio,'adaptive');assert.equal(payload.input_references,undefined);assert.equal(payload.generationMode,undefined)});
 await test('active owned Asset IDs resolve server-side',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.0-mini',{generationMode:'subject-reference',providerAssetIds:[1],seconds:4,resolution:'720p'}));assert.equal(r.status,200);assert.equal(payload.input_references[0].url,'asset://owned-1');assert.equal(payload.input_references[0].role,'reference_image');assert.equal(payload.providerAssetIds,undefined)});
 await test('raw asset URI cannot bypass ownership',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.0-mini',{generationMode:'subject-reference',imageUrls:['asset://foreign'],seconds:4}));assert.equal(r.status,400);assert.equal(counts.paid,0)});
 await test('disabled edit mode fails before billing',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.0-mini',{generationMode:'video-edit',seconds:4}));assert.equal(r.status,400);assert.equal(counts.paid,0)});
 await test('one frame cannot trigger two-frame generation',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.5',{generationMode:'first-last-frame',assetIds:[1],seconds:4}));assert.equal(r.status,400);assert.equal(counts.paid,0)});
 console.log('PASS '+checks.length+' mode route contracts; mocked external effects only');
})().catch(e=>{console.error(e);process.exitCode=1});
