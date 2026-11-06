const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
  return mod.exports;
}
const { allocateMention, resolveMentionPrompt } = load('lib/businessMentions.ts');
const { selectBusinessModel, businessStudioHref, parseBusinessStudioLocation } = load('lib/businessStudio.ts');
const refs = [{ key: 'local:1', name: '人物.png', type: 'image' }, { key: 'provider:two', name: '人物.jpg', type: 'image' }];
const bindings = {};
for (const ref of refs) bindings[allocateMention(ref, bindings)] = ref.key;
assert.deepEqual(bindings, { 人物: 'local:1', 人物_2: 'provider:two' });
assert.equal(allocateMention(refs[0], bindings), '人物');
assert.equal(resolveMentionPrompt('@人物 走向 @人物_2。', bindings, refs), 'reference image 1 走向 reference image 2。');
assert.equal(resolveMentionPrompt('@人物 走向 @人物_2。', bindings, [...refs].reverse()), 'reference image 2 走向 reference image 1。');
assert.throws(() => resolveMentionPrompt('@人物', bindings, [refs[1]]), /mention_reference_missing/);
assert.equal(resolveMentionPrompt('contact@example.com', bindings, refs), 'contact@example.com');
assert.equal(resolveMentionPrompt('@人物_20', bindings, refs), '@人物_20');
const models = [{ id: 'gpt-6:exact', modality: 'text', nsfw: false }, { id: 'another', modality: 'text', nsfw: false }];
assert.equal(selectBusinessModel(models, 'text', 'missing'), undefined);
assert.equal(selectBusinessModel(models, 'image', models[0].id), undefined);
assert.equal(selectBusinessModel(models, 'text', models[0].id), models[0]);
assert.equal(selectBusinessModel(models, 'text', ''), models[0]);
const href = businessStudioHref({ kind: 'text', tab: 'create', modelId: models[0].id });
assert.equal(parseBusinessStudioLocation(new URL(href, 'https://example.com').searchParams).modelId, models[0].id);
console.log('PASS mention identity, duplicate filenames, reference reordering, removed-reference blocking and exact model navigation');
