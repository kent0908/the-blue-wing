/* Pure shared BYOK capability and provider-payload regression. No network, database or paid calls. */
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/businessSeedance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded, loaded.exports);
const { getSeedanceCapability: caps, buildBusinessSeedancePayload: build, assertBusinessSeedanceReferences: validateRefs } = loaded.exports;
const base = { model: 'SIRAYA-Seedance-2.5', prompt: 'A blue feather crosses a paper city.', seconds: 8, resolution: '1080p', aspect_ratio: '16:9', generate_audio: true };
const refs = (type, n) => Array.from({ length: n }, (_, i) => ({ type, url: `asset://owned-${type}-${i}` }));
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }
test('all reviewed standard and NSFW aliases share exact version capabilities', () => {
  for (const prefix of ['', 'SIRAYA-', 'NSFW-SIRAYA-']) for (const suffix of ['2.0', '2.0-fast', '2.0-mini', '2.5']) {
    const c = caps(prefix + 'Seedance-' + suffix); assert.ok(c); assert.equal(c.version, suffix === '2.5' ? '2.5' : '2.0');
    assert.deepEqual(c.references, suffix === '2.5' ? { total: 50, image: 30, video: 10, audio: 10 } : { total: 15, image: 9, video: 3, audio: 3 });
    assert.equal(c.aspectRatios.length, 7); assert.equal(c.modes.length, 7);
  }
  for (const id of ['unknown-seedance-2.5', 'SIRAYA-Seedance-2.5-guessed', 'SIRAYA-Seedance-1.5-pro', 'kling-3.0']) assert.equal(caps(id), undefined);
});
test('resolution and duration catalogs distinguish 2.0 standard, fast, mini and 2.5', () => {
  assert.deepEqual(caps('SIRAYA-Seedance-2.5').resolutions, ['480p', '720p', '1080p']);
  assert.deepEqual(caps('SIRAYA-Seedance-2.0').resolutions, ['480p', '720p', '1080p', '4k']);
  for (const id of ['SIRAYA-Seedance-2.0-mini', 'SIRAYA-Seedance-2.0-fast']) assert.deepEqual(caps(id).resolutions, ['480p', '720p']);
  assert.equal(caps(base.model).maxSeconds, 30); assert.equal(caps('SIRAYA-Seedance-2.0').maxSeconds, 15);
});
test('Seedance 2.5 accepts 50 total materials without confusing that with 50 images', () => {
  const all = [...refs('image', 30), ...refs('video', 10), ...refs('audio', 10)];
  const wire = build({ ...base, mode: 'subject-reference', seconds: -1 }, all);
  assert.equal(wire.input_references.length, 50); assert.equal(wire.seconds, -1);
  assert.deepEqual(wire.input_references.map(ref => ref.type), all.map(ref => ref.type));
  assert.ok(wire.input_references.every(ref => ref.role === 'reference_' + ref.type));
  for (const invalid of [refs('image', 31), refs('video', 11), refs('audio', 11), [...all, ...refs('image', 1)]]) assert.throws(() => build({ ...base, seconds: -1 }, invalid));
});
test('Seedance 2.0 accepts its full 15-material allocation and rejects per-type overflow', () => {
  const p = { ...base, model: 'NSFW-SIRAYA-Seedance-2.0', seconds: -1 };
  assert.equal(build(p, [...refs('image', 9), ...refs('video', 3), ...refs('audio', 3)]).input_references.length, 15);
  for (const invalid of [refs('image', 10), refs('video', 4), refs('audio', 4)]) assert.throws(() => build(p, invalid));
});
test('backward compatible freestyle supports empty text and five or thirty image references', () => {
  assert.equal(build(base, []).input_references, undefined);
  for (const n of [5, 30]) assert.equal(build(base, refs('image', n)).input_references.length, n);
});
test('audio-only reference is supported by 2.5 and rejected by 2.0', () => {
  assert.equal(build(base, refs('audio', 1)).input_references[0].role, 'reference_audio');
  assert.throws(() => build({ ...base, model: 'SIRAYA-Seedance-2.0' }, refs('audio', 1)));
});
test('explicit text mode refuses every reference and emits no reference/frame fields', () => {
  const wire = build({ ...base, mode: 'text-to-video' }, []);
  for (const key of ['input_references', 'image_url', 'frame_images', 'mode']) assert.equal(wire[key], undefined);
  assert.throws(() => build({ ...base, mode: 'text-to-video' }, refs('image', 1)));
});
test('single image and exact first/last modes preserve order and use adaptive 2.5 ratio', () => {
  const image = build({ ...base, mode: 'image-to-video' }, refs('image', 1));
  assert.deepEqual(image.frame_images, [{frame_type:'first_frame',image_url:'asset://owned-image-0'}]); assert.equal(image.image_url, undefined); assert.equal(image.aspect_ratio, 'adaptive'); assert.equal(image.input_references, undefined);
  const pair = build({ ...base, mode: 'first-last-frame', referenceOrder: ['provider:last', 'local:1'] }, refs('image', 2));
  assert.deepEqual(pair.frame_images, [{ frame_type: 'first_frame', image_url: 'asset://owned-image-0' }, { frame_type: 'last_frame', image_url: 'asset://owned-image-1' }]);
  assert.equal(pair.aspect_ratio, 'adaptive'); assert.equal(pair.input_references, undefined); assert.equal(pair.referenceOrder, undefined);
  assert.equal(build({ ...base, model: 'SIRAYA-Seedance-2.0', mode: 'first-last-frame' }, refs('image', 2)).aspect_ratio, '16:9');
  for (const invalid of [[], refs('image', 1), refs('image', 3), [...refs('image', 1), ...refs('audio', 1)]]) assert.throws(() => build({ ...base, mode: 'first-last-frame' }, invalid));
});
test('editing and extending require a video, explicit auto duration and adaptive 2.5 ratio', () => {
  for (const mode of ['video-edit', 'video-extend']) {
    const wire = build({ ...base, mode, seconds: -1 }, refs('video', 1));
    assert.equal(wire.aspect_ratio, 'adaptive'); assert.equal(wire.seconds, -1); assert.equal(wire.mode, undefined);
    assert.ok(wire.prompt.startsWith(mode === 'video-edit' ? 'Video edit: ' : 'Video extension: extend and continue the input video. '));
    assert.equal(build({...base,mode,seconds:-1,prompt:wire.prompt},refs('video',1)).prompt,wire.prompt,'mode intent prefix is applied once');
    assert.throws(() => build({ ...base, mode, seconds: -1 }, refs('image', 1)));
    assert.throws(() => build({ ...base, mode, seconds: 8 }, refs('video', 1)));
  }
  assert.throws(() => build(base, refs('video', 1)), 'fixed duration is never silently changed for video references');
});
test('BYOK automatic duration is isolated from fixed duration limits', () => {
  assert.equal(build({ ...base, seconds: -1 }, []).seconds, -1);
  assert.equal(build({ ...base, seconds: 30 }, []).seconds, 30);
  for (const seconds of [-2, 0, 3, 31, 4.5, '8']) assert.throws(() => build({ ...base, seconds }, []));
  assert.throws(() => build({ ...base, model: 'SIRAYA-Seedance-2.0', seconds: 16 }, []));
});
test('only documented output formats are forwarded for 2.5', () => {
  for (const output_format of ['mp4', 'mov']) assert.equal(build({ ...base, output_format }, []).output_format, output_format);
  for (const output_format of ['avi', 'MP4', '', null]) assert.throws(() => build({ ...base, output_format }, []));
  assert.throws(() => build({ ...base, model: 'SIRAYA-Seedance-2.0', output_format: 'mp4' }, []));
});
test('all seven aspect ratios and exact supported controls validate', () => {
  for (const aspect_ratio of caps(base.model).aspectRatios) assert.equal(build({ ...base, aspect_ratio, seed: 123 }, []).aspect_ratio, aspect_ratio);
  for (const extra of [{ aspect_ratio: '2:1' }, { generate_audio: 'true' }, { seed: 0.5 }, { resolution: '4k' }, { prompt: '' }, { mode: 'guessed-mode' }]) assert.throws(() => build({ ...base, ...extra }, []));
});
test('unreviewed passthrough, URLs, callbacks and controls never enter a provider payload', () => {
  for (const extra of [{ callback_url: 'https://evil.invalid' }, { extra_body: { draft: true } }, { image_url: 'https://evil.invalid' }, { video_url: 'https://evil.invalid' }, { input_references: [] }, { negative_prompt: 'Unreviewed' }, { camera_fixed: true }, { return_last_frame: true }, { draft: true }]) assert.throws(() => build({ ...base, ...extra }, []));
  assert.throws(() => validateRefs(caps(base.model), 'subject-reference', []));
});
console.log(`Business Seedance: ${count} pure contract cases passed; no paid or remote calls.`);
