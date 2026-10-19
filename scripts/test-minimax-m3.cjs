/** Actual curation, Composer selection, model API and chat route. Providers/billing are fixtures, not paid calls. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const cache = new Map();
class SirayaApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
let calls = [], estimates = [], charges = [], histories = [], refunds = 0;
const chatResult = { choices: [{ message: { content: 'A blue feather crosses the quiet city.' } }] };
const liveModels = ['deepseek-v4.1-flash', 'gemini-3.5-flash', 'gpt-5.4-mini', 'claude-haiku-4.5', 'minimax-m3', 'minimax-h3', 'minimax-h3-max', 'FW-MiniMax-M2.5', 'kling-tts', 'gemini-3.8-flash-tts'];
const mocks = {
  '@/lib/apiauth': { requireUser: async () => ({ user: { id: 7 } }) },
  '@/lib/credits': { creditCost: async input => { estimates.push(input); return 2; }, getBalance: async () => 10000 },
  '@/lib/creditTransactions': { paidCall: async (user, cost, kind, model, fn) => { charges.push({ user, cost, kind, model }); return { result: await fn(), chargeId: 1 }; }, refundCharge: async () => { refunds++; } },
  '@/lib/generations': { recordGeneration: async (_user, row) => { histories.push(row); } },
  '@/lib/crm': { recordProviderReceipt: async () => {} },
  '@/lib/providerReceipt': { observeBillingStream: stream => stream },
  '@/lib/errors': { errorResponse: error => NextResponse.json({ error: { message: 'Fixture validation failed' } }, { status: error.status ?? 500 }) },
  '@/lib/modelDisplay': { listModelDisplayOverrides: async () => new Map(), resolveModelDisplay: id => ({ displayName: id, sortOrder: 0 }), sortByDisplay: rows => rows },
  './i18n/k': { k: value => value },
  '@/lib/imageModels': { getImageModel: () => undefined, sizeOptionsFor: () => [] },
  '@/lib/layerDecomposition': { validateLayerRequest() {} },
  '@/lib/siraya': {
    SirayaApiError,
    listModels: async () => ({ data: liveModels.map(id => ({ id, owned_by: 'fixture' })) }),
    createChatCompletion: async body => { calls.push(structuredClone(body)); return chatResult; },
    createChatCompletionStream: async body => { calls.push(structuredClone(body)); return new Response('data: {"fixture":true}\n\ndata: [DONE]\n\n'); },
  },
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    const normalized = id.startsWith('.') ? '@/'+path.relative(process.cwd(), path.resolve(path.dirname(file), id)).replaceAll('\\', '/') : id;
    if (Object.hasOwn(mocks, normalized)) return mocks[normalized];
    if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), `${id}.ts`));
    return require(id);
  }, module, module.exports);
  return module.exports;
}

function composerMemo(name) {
  const file = ts.createSourceFile('Composer.tsx', fs.readFileSync('components/Composer.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(callback, `actual Composer ${name} memo exists`);
  const output = ts.transpileModule(`module.exports = function (mode, models, AUDIO_MODELS, model, initialModel, available, currentGeminiTextModel) {
    const modalityForMode = mode === 'video' ? 'video' : mode === 'image' ? 'image' : 'text';
    const IMAGE_MODELS = []; const videoResolutionsForModel = () => [];
    return (${callback})();
  }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixture = { exports: {} }; new Function('module', output)(fixture); return fixture.exports;
}

(async () => {
  const curated = load('lib/audioModels.ts').AUDIO_MODELS;
  const original = ['deepseek-v4.1-flash', 'gemini-3.5-flash', 'gpt-5.4-mini', 'claude-haiku-4.5'];
  assert.deepEqual(curated, [...original, 'minimax-m3']);
  const picker = load('lib/generationPickerModels.ts');
  const pricing = load('lib/pricing.ts');
  const fresh = load('lib/modelNew.ts');
  const migration = load('lib/geminiTextModels.ts');
  assert.equal(picker.isGenerationPickerModel('minimax-m3'), true);
  assert.equal(pricing.modalityOf('minimax-m3'), 'text');
  assert.equal(migration.currentGeminiTextModel('minimax-m3'), 'minimax-m3', 'M3 is never aliased to an older chat model');
  assert.equal(fresh.isNewModel('minimax-m3'), true);
  assert.equal(fresh.isNewModel('FW-MiniMax-M2.5'), false);
  for (const id of ['kling-tts', 'gemini-3.8-flash-tts']) {
    assert.equal(curated.includes(id), false);
    assert.equal(picker.isGenerationPickerModel(id), false);
  }
  const catalogue = load('app/api/models/route.ts');
  const response = await catalogue.GET();
  assert.equal(response.status, 200);
  const models = (await response.json()).models;
  assert.equal(models.find(model => model.id === 'minimax-m3').modality, 'text');
  for (const id of ['kling-tts', 'gemini-3.8-flash-tts']) assert.ok(!models.some(model => model.id === id));
  const available = composerMemo('available')('audio', models, curated);
  assert.deepEqual(available.map(model => model.id), curated, 'actual text picker retains order and includes exact M3');
  const resolve = composerMemo('resolvedModel');
  assert.equal(resolve('audio', models, curated, 'minimax-m3', undefined, available, migration.currentGeminiTextModel), 'minimax-m3');
  assert.equal(resolve('audio', models, curated, '', 'MiniMax-M3', available, migration.currentGeminiTextModel), 'minimax-m3');
  assert.equal(resolve('audio', models, curated, '', undefined, available, migration.currentGeminiTextModel), original[0], 'existing default remains unchanged');

  const chat = load('app/api/chat/route.ts');
  for (const stream of [false, true]) {
    const result = await chat.POST(new NextRequest('https://fixture.invalid/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'minimax-m3', messages: [{ role: 'user', content: 'Write a brief scene about a blue feather.' }], max_tokens: 1024, stream }) }));
    assert.equal(result.status, 200);
    if (stream) assert.match(await result.text(), /\[DONE\]/);
    else assert.equal((await result.json()).choices[0].message.content, chatResult.choices[0].message.content);
  }
  assert.equal(calls.length, 2);
  assert.ok(calls.every(body => body.model === 'minimax-m3' && body.max_tokens === 1024), 'normal and streamed provider requests keep exact M3 model');
  assert.ok(estimates.every(input => input.model === 'minimax-m3'));
  assert.ok(charges.every(charge => charge.kind === 'text' && charge.model === 'minimax-m3'));
  assert.equal(histories[0].model, 'minimax-m3');
  assert.equal(refunds, 0);
  console.log('PASS MiniMax M3: exact live model ID, all existing text choices/default preserved, actual Composer explicit/query selection, public model modality, TTS exclusion, normal/streaming C chat requests and billing/history model preservation. No paid calls or live data changes.');
})().catch(error => { console.error('FAIL MiniMax M3 fixture:', error.stack); process.exitCode = 1; });
