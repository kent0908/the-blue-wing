const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const caps = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/minimaxVideo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, caps);
const settings = { exports: {}, require: path => { assert.equal(path, './minimaxVideo'); return caps.exports; } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/minimaxSettings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, settings);
const normalize = settings.exports.normalizeMiniMaxSettings;
const stale = { resolution: '1080p', seconds: 30, aspectRatio: 'auto', generateAudio: false, imageCount: 1, size: '1024x1024', maxTokens: 1024 };
for (const model of caps.exports.MINIMAX_VIDEO_MODELS) {
  const actual = normalize(model.id, stale);
  assert.equal(actual.seconds, 15, 'Stale30s clips to approved maximum');
  assert.equal(actual.aspectRatio, '16:9');
  assert.equal(actual.resolution, model.resolutions[0]);
  assert.equal(actual.generateAudio, true, 'Native audio cannot be disabled');
  assert.equal(normalize(model.id, { ...stale, seconds: 2 }).seconds, model.minSeconds);
  assert.equal(normalize(model.id, { ...stale, seconds: NaN }).seconds, model.defaultSeconds);
  assert.equal(normalize(model.id, { ...stale, seconds: 7 }).seconds, 7, 'Continuous integer durations remain available');
  for (const resolution of model.resolutions) assert.equal(normalize(model.id, { ...stale, resolution }).resolution, resolution);
  for (const aspectRatio of model.aspectRatios) assert.equal(normalize(model.id, { ...stale, aspectRatio }).aspectRatio, aspectRatio);
}
assert.equal(normalize('SIRAYA-Seedance-2.5', stale), stale);
console.log('PASS MiniMax editor settings: H3/H3Max resolutions, continuous duration, six aspects, native audio and unrelated-model isolation.');
