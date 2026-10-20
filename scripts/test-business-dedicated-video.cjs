/* Pure SIRAYA-specific BYOK Wan/HappyHorse wire-contract regressions.
 * No network, credentials, database mutation, generated media or paid requests.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/businessDedicatedVideo.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(loaded, loaded.exports);
const { getBusinessDedicatedVideoCapability: caps, assertBusinessDedicatedVideoReferences: refsValid, buildBusinessDedicatedVideoPayload: build } = loaded.exports;
const image = index => ({ type: 'image', url: `https://owned.invalid/image-${index}.png` });
const video = { type: 'video', url: 'https://owned.invalid/video.mp4' };
const audio = { type: 'audio', url: 'https://owned.invalid/audio.wav' };
const images = count => Array.from({ length: count }, (_, index) => image(index));
const base = model => ({ model, prompt: 'A blue paper crane takes flight.', seconds: 5, resolution: '720p', aspect_ratio: '16:9' });
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }

test('only eleven exact published model identifiers gain a BYOK contract', () => {
  const ids = ['wan2.7-t2v', 'wan2.7-i2v', 'wan2.7-r2v', 'wan2.7-videoedit', ...['1.0', '1.1'].flatMap(version => ['t2v', 'i2v', 'r2v'].map(mode => `happyhorse-${version}-${mode}`)), 'happyhorse-1.0-video-edit'];
  assert.equal(ids.length, 11);
  ids.forEach(id => assert.ok(caps(id), id));
  for (const id of ['happyhorse-1.1-video-edit', 'wan2.7-guessed', 'wan2.7-r2v-preview', 'wan3.0-video', 'NSFW-wan2.7-r2v', 'HAPPYHORSE-1.1-T2V', null, undefined]) assert.equal(caps(id), undefined);
});
test('catalog preserves lowercase UI resolutions and documented family limits', () => {
  assert.deepEqual(caps('happyhorse-1.1-r2v').resolutions, ['480p', '720p', '1080p']);
  assert.deepEqual(caps('happyhorse-1.0-r2v').resolutions, ['720p', '1080p']);
  assert.equal(caps('happyhorse-1.1-i2v').maxReferenceImages, 1);
  assert.equal(caps('happyhorse-1.1-r2v').maxReferenceImages, 9);
  assert.equal(caps('wan2.7-r2v').maxReferenceImages, 5);
  assert.equal(caps('wan2.7-videoedit').defaultSeconds, 0);
  assert.equal(caps('wan2.7-videoedit').maxSeconds, 10);
  assert.equal(caps('happyhorse-1.0-video-edit').sourceDuration, true);
  assert.equal(caps('happyhorse-1.1-r2v').referenceImageRules.minSide, 400);
});
test('all families require case-sensitive uppercase resolutions on the wire', () => {
  for (const model of ['happyhorse-1.1-t2v', 'wan2.7-t2v']) for (const resolution of ['720p', '1080p']) {
    assert.equal(build({ ...base(model), resolution }, []).resolution, resolution.toUpperCase());
  }
  assert.equal(build({ ...base('happyhorse-1.1-t2v'), resolution: '480p' }, []).resolution, '480P');
  for (const resolution of ['480p', '4k', '720P']) assert.throws(() => build({ ...base('wan2.7-t2v'), resolution }, []));
  assert.throws(() => build({ ...base('happyhorse-1.0-t2v'), resolution: '480p' }, []));
});
test('HappyHorse text-to-video never emits the generic C-end media/audio fields', () => {
  const p = build({ ...base('happyhorse-1.1-t2v'), seed: 42 }, []);
  assert.deepEqual(p, { model: 'happyhorse-1.1-t2v', prompt: base('x').prompt, resolution: '720P', watermark: false, async: true, seconds: 5, aspect_ratio: '16:9', seed: 42 });
  for (const extra of [{ generate_audio: true }, { negative_prompt: 'blur' }, { prompt_extend: false }, { extra_body: {} }]) assert.throws(() => build({ ...base('happyhorse-1.1-t2v'), ...extra }, []));
  for (const ref of [image(0), video, audio]) assert.throws(() => build(base('happyhorse-1.1-t2v'), [ref]));
});
test('HappyHorse i2v pins exactly one first frame and omits ineffective ratio', () => {
  const p = build({ ...base('happyhorse-1.1-i2v'), mode: 'image-to-video' }, [image(0)]);
  assert.deepEqual(p.frame_images, [{ frame_type: 'first_frame', image_url: image(0).url }]);
  assert.equal(p.input_references, undefined); assert.equal(p.aspect_ratio, undefined);
  for (const refs of [[], images(2), [video], [image(0), audio]]) assert.throws(() => build(base('happyhorse-1.1-i2v'), refs));
  assert.throws(() => build({ ...base('happyhorse-1.1-i2v'), mode: 'first-last-frame' }, images(2)));
});
test('HappyHorse r2v preserves all nine image slots and positional prompt references', () => {
  const p = build({ ...base('happyhorse-1.1-r2v'), prompt: '[Image 1] follows [Image 9].' }, images(9));
  assert.deepEqual(p.input_references, images(9).map(ref => ({ role: 'reference_image', url: ref.url })));
  assert.equal(p.frame_images, undefined); assert.equal(p.prompt, '[Image 1] follows [Image 9].');
  for (const refs of [[], images(10), [video], [image(0), audio]]) assert.throws(() => build(base('happyhorse-1.1-r2v'), refs));
});
test('HappyHorse video editing uses source length, exact video role and up to five images', () => {
  const parameters = { model: 'happyhorse-1.0-video-edit', prompt: 'Restyle as an ink painting.', resolution: '1080p', audio_setting: 'origin' };
  const p = build(parameters, [video, ...images(5)]);
  assert.equal(p.seconds, undefined); assert.equal(p.aspect_ratio, undefined); assert.equal(p.audio_setting, 'origin');
  assert.deepEqual(p.input_references[0], { role: 'video', url: video.url });
  assert.ok(p.input_references.slice(1).every(ref => ref.role === 'reference_image'));
  for (const refs of [[], images(1), [video, video], [video, ...images(6)], [video, audio]]) assert.throws(() => build(parameters, refs));
  for (const seconds of [0, 5, -1]) assert.throws(() => build({ ...parameters, seconds }, [video]));
});
test('HappyHorse integer duration boundaries are enforced before media reads', () => {
  for (const seconds of [3, 15]) assert.equal(build({ ...base('happyhorse-1.1-t2v'), seconds }, []).seconds, seconds);
  for (const seconds of [0, 2, 16, -1, 3.5, '5']) assert.throws(() => build({ ...base('happyhorse-1.1-t2v'), seconds }, []));
});
test('HappyHorse prompt, seed and watermark constraints remain explicit', () => {
  assert.equal(build({ ...base('happyhorse-1.1-t2v'), prompt: 'A'.repeat(5000), seed: 2147483647, watermark: true }, []).watermark, true);
  for (const prompt of ['', 'A'.repeat(5001), '景'.repeat(2501)]) assert.throws(() => build({ ...base('happyhorse-1.1-t2v'), prompt }, []));
  for (const seed of [-1, 0.5, 2147483648, '42']) assert.throws(() => build({ ...base('happyhorse-1.1-t2v'), seed }, []));
  assert.throws(() => build({ ...base('happyhorse-1.1-t2v'), watermark: 'false' }, []));
});
test('Wan t2v accepts one resolved driving audio and no image/video references', () => {
  const p = build({ ...base('wan2.7-t2v'), generate_audio: true, negative_prompt: 'blur', prompt_extend: true }, [audio]);
  assert.equal(p.audio_url, audio.url); assert.equal(p.input_references, undefined);
  assert.equal(p.generate_audio, true); assert.equal(p.negative_prompt, 'blur'); assert.equal(p.prompt_extend, true);
  assert.equal(build(base('wan2.7-t2v'), []).prompt_extend, false);
  for (const refs of [[audio, audio], [image(0)], [video]]) assert.throws(() => build(base('wan2.7-t2v'), refs));
});
test('Wan first-last frames are ordered and never sent as soft references', () => {
  const p = build({ ...base('wan2.7-i2v'), mode: 'first-last-frame' }, images(2));
  assert.deepEqual(p.frame_images, [{ frame_type: 'first_frame', image_url: image(0).url }, { frame_type: 'last_frame', image_url: image(1).url }]);
  assert.equal(p.input_references, undefined); assert.equal(p.aspect_ratio, undefined);
  for (const refs of [[], images(1), images(3), [video], [...images(2), audio]]) assert.throws(() => build({ ...base('wan2.7-i2v'), mode: 'first-last-frame' }, refs));
});
test('Wan lip-sync requires one first frame plus one driving audio', () => {
  const p = build({ ...base('wan2.7-i2v'), mode: 'image-to-video' }, [image(0), audio]);
  assert.deepEqual(p.frame_images, [{ frame_type: 'first_frame', image_url: image(0).url }]);
  assert.deepEqual(p.input_references, [{ role: 'driving_audio', url: audio.url }]);
  for (const refs of [[audio], [...images(2), audio], [image(0), audio, audio]]) assert.throws(() => build(base('wan2.7-i2v'), refs));
});
test('Wan continuation takes exactly one first_clip, retaining total requested length', () => {
  const p = build({ ...base('wan2.7-i2v'), mode: 'video-extend', seconds: 10 }, [video]);
  assert.deepEqual(p.input_references, [{ role: 'first_clip', url: video.url }]);
  assert.equal(p.seconds, 10); assert.equal(p.frame_images, undefined);
  for (const refs of [[], images(1), [video, image(0)], [video, audio], [video, video]]) assert.throws(() => build({ ...base('wan2.7-i2v'), mode: 'video-extend' }, refs));
});
test('Wan r2v exposes only the documented router image role and native five-material bound', () => {
  const refs = images(5); refs[0].voiceUrl = audio.url;
  const p = build(base('wan2.7-r2v'), refs);
  assert.equal(p.input_references.length, 5);
  assert.equal(p.input_references[0].voice_url, audio.url);
  assert.ok(p.input_references.every(ref => ref.role === 'reference_image' && ref.type === undefined));
  for (const refs of [[], images(6), [video], [image(0), audio]]) assert.throws(() => build(base('wan2.7-r2v'), refs));
  assert.throws(() => build(base('happyhorse-1.1-r2v'), refs));
});
test('Wan editing pins exactly one source video and has explicit source-duration semantics', () => {
  const p = build({ model: 'wan2.7-videoedit', prompt: 'Change to watercolor.', resolution: '720p', audio_setting: 'origin' }, [video]);
  assert.equal(p.seconds, 0); assert.equal(p.audio_setting, 'origin'); assert.equal(p.aspect_ratio, undefined);
  assert.deepEqual(p.input_references, [{ role: 'video', url: video.url }]);
  for (const seconds of [2, 10]) assert.equal(build({ ...base('wan2.7-videoedit'), seconds }, [video]).seconds, seconds);
  for (const seconds of [-1, 1, 11, '0']) assert.throws(() => build({ ...base('wan2.7-videoedit'), seconds }, [video]));
  for (const refs of [[], images(1), [video, image(0)], [video, audio], [video, video]]) assert.throws(() => build(base('wan2.7-videoedit'), refs));
});
test('Wan duration, optional controls and mode combinations are bounded', () => {
  for (const seconds of [2, 15]) assert.equal(build({ ...base('wan2.7-t2v'), seconds }, []).seconds, seconds);
  for (const extra of [{ seconds: -1 }, { seconds: 16 }, { seconds: 2.5 }, { generate_audio: 'true' }, { prompt_extend: 1 }, { negative_prompt: 42 }, { seed: -2 }, { mode: 'video-edit' }, { audio_setting: 'origin' }]) assert.throws(() => build({ ...base('wan2.7-t2v'), ...extra }, []));
  assert.equal(build({ ...base('wan2.7-t2v'), seed: -1 }, []).seed, -1);
});
test('all published ratio options validate and unknown values never fall through', () => {
  for (const model of ['wan2.7-t2v', 'happyhorse-1.1-r2v']) for (const aspect_ratio of caps(model).aspectRatios) {
    assert.equal(build({ ...base(model), aspect_ratio }, model.includes('r2v') ? images(1) : []).aspect_ratio, aspect_ratio);
  }
  for (const model of ['wan2.7-t2v', 'happyhorse-1.1-t2v']) assert.throws(() => build({ ...base(model), aspect_ratio: 'adaptive' }, []));
});
test('account-scoped ID metadata is stripped and no arbitrary URL or callback is accepted', () => {
  const p = build({ ...base('wan2.7-r2v'), mode: 'subject-reference', assetIds: [1], businessAssetIds: ['opaque'], providerAssets: [{ id: 'opaque', type: 'image' }], referenceOrder: ['local:1'] }, images(1));
  for (const key of ['assetIds', 'businessAssetIds', 'providerAssets', 'referenceOrder', 'mode']) assert.equal(p[key], undefined);
  for (const extra of [{ image_url: 'https://evil.invalid' }, { audio_url: 'https://evil.invalid' }, { video_url: 'https://evil.invalid' }, { input_references: [] }, { frame_images: [] }, { callbackUrl: 'https://evil.invalid' }, { extra_body: { watermark: false } }, { output_format: 'mov' }, { size: '720p' }, { duration: 5 }]) assert.throws(() => build({ ...base('wan2.7-t2v'), ...extra }, []));
  assert.throws(() => build(base('wan2.7-r2v'), [{ type: 'image', url: '' }]));
  for (const url of ['asset://owned-seedance-only', 'http://owned.invalid/image.png', 'file:///private/image.png', 'https://name:password@owned.invalid/image.png']) assert.throws(() => build(base('wan2.7-r2v'), [{ type: 'image', url }]));
  assert.equal(build(base('wan2.7-r2v'), [{ type: 'image', url: 'data:image/png;base64,aGVsbG8=' }]).input_references.length, 1);
  assert.throws(() => refsValid(caps('wan2.7-r2v'), 'subject-reference', [{ type: 'file' }]));
});

console.log(`Business dedicated video: ${count} pure contract groups passed; no paid or remote calls.`);
