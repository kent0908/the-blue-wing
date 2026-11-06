const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript');
const original = global.fetch;
let writes = 0, registrations = 0, fail = true, stages = [];
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('lib/uploadAsset.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => {
  if (id === '@vercel/blob/client') return { upload: async (pathname, file, options) => { writes++; options.onUploadProgress({ percentage: 95 }); return { pathname }; } };
  if (id === './assets') return { ALLOWED_ASSET_TYPES: { 'image/png': true }, MAX_ASSET_BYTES: 4 * 1024 * 1024, MAX_ASSET_BYTES_DIRECT: 64 * 1024 * 1024 };
  if (id === './i18n/k') return { k: value => value };
  throw new Error(id);
}, mod, mod.exports);
global.fetch = async (url, options) => {
  if (url === '/api/assets/upload') return Response.json({ available: true });
  if (url === '/api/auth/me') return Response.json({ user: { id: 7 } });
  assert.equal(url, '/api/assets/register'); registrations++;
  assert.ok(options.signal);
  if (fail) return Response.json({ error: { message: 'temporary registration failure' } }, { status: 503 });
  return Response.json({ asset: { id: 9, name: 'same.png' } });
};
(async () => {
  const file = new File(['image'], 'same.png', { type: 'image/png' });
  await assert.rejects(() => mod.exports.uploadAsset(file, { onStage: stage => stages.push(stage) }));
  assert.deepEqual(stages, ['preparing', 'uploading', 'registering']);
  fail = false; stages = [];
  assert.equal((await mod.exports.uploadAsset(file, { onStage: stage => stages.push(stage) })).id, 9);
  assert.equal(writes, 1); assert.equal(registrations, 2);
  assert.deepEqual(stages, ['preparing', 'registering']);
  await mod.exports.uploadAsset(new File(['other'], 'same.png', { type: 'image/png' }));
  assert.equal(writes, 2, 'same filename is a different upload');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => mod.exports.uploadAsset(file, { signal: controller.signal }));
  assert.equal(registrations, 3, 'cancelled retry never registers');
  console.log('PASS upload phases, registration-only retry, same-name isolation and cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = original; });
