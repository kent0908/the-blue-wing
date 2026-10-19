const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const caps = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/klingVideo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, caps);
const settings = { exports: {}, require: path => { assert.equal(path, './klingVideo'); return caps.exports; } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/klingSettings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, settings);
const normalize = settings.exports.normalizeKlingSettings;
const stale = { resolution: '480p', seconds: 4, aspectRatio: 'auto', generateAudio: true, imageCount: 1, size: '1024x1024', maxTokens: 1024 };
for (const model of caps.exports.KLING_VIDEO_MODELS) {
  const actual = normalize(model.id, stale);
  assert.equal(actual.seconds, 5);
  assert.equal(actual.aspectRatio, '16:9');
  assert.equal(actual.resolution, '720p');
  assert.equal(actual.generateAudio, model.nativeAudioOnly || model.supportsAudio && model.nativeAudioResolutions.includes('720p'));
  for (const seconds of [6, 7, 8, 9]) assert.equal(normalize(model.id, { ...stale, seconds }).seconds, 5);
  assert.equal(normalize(model.id, { ...stale, seconds: 10 }).seconds, 10);
}
assert.equal(normalize('kling-2.6', { ...stale, resolution: '1080p' }).generateAudio, true);
assert.equal(normalize('kling-3.0-turbo', { ...stale, generateAudio: false }).generateAudio, true);
assert.equal(normalize('kling-o1', stale).generateAudio, false);
assert.equal(normalize('SIRAYA-Seedance-2.5', stale), stale, 'Unrelated models are untouched');
console.log('PASS Kling editor settings: six model contracts; stale duration/aspect/resolution; exact5/10; audio capability and native-only rules.');
