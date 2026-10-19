const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercises the actual paid-confirmation handlers. All fetches are fixtures;
// this script never calls a provider, writes a credential, or spends credits.
const source = fs.readFileSync('components/business/BusinessWorkspace.tsx', 'utf8');
const ast = ts.createSourceFile('BusinessWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['requestConfirmation', 'submitGeneration', 'saveKey'].includes(node.name.getText(ast)) && ts.isArrowFunction(node.initializer)) handlers[node.name.getText(ast)] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
for (const key of ['requestConfirmation', 'submitGeneration', 'saveKey']) assert.ok(handlers[key], `${key} actual handler found`);
const noop = () => {};
function makeContext() {
  let sequence = 0;
  const calls = [];
  const context = {
    crypto: { randomUUID: () => `fixture-request-${++sequence}` },
    submitLock: { current: false }, keyLock: { current: false }, unresolvedRequest: { current: null }, uncertain: false,
    selected: { id: 'kling-3.0-turbo', supportsAudio: true, nativeAudioOnly: true, nativeAudioResolutions: ['720p', '1080p'], secondsOptions: [5, 10], defaultSeconds: 5, resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1'], supportsReferences: true, maxReferenceImages: 1, promptMaxChars: 2500, nsfw: false },
    prompt: 'A blue feather moves through a paper theatre.', kind: 'video', seconds: 7, resolution: '720p', size: '', aspect: '21:9', audio: false, assetIds: [],
    access: { adultVerified: false }, t: { ageRequired: 'age', keyWarning: 'key', uncertain: 'unknown', error: 'error', unavailable: 'offline', submittingNotice: 'sent', keyFormat: 'format', keySaved: 'saved' }, klingText: { promptLimit: 'long', referenceLimit: 'refs' },
    REQUEST_HEADERS: { 'Content-Type': 'application/json' },
    PRE_SUBMIT_ERRORS: new Set(['invalid_origin', 'invalid_body', 'invalid_parameters', 'invalid_reference', 'model_unavailable', 'age_unverified', 'credential_required', 'credential_changed', 'prompt_blocked', 'too_many_concurrent', 'business_not_approved', 'business_suspended', 'encryption_unavailable', 'credential_unavailable']),
    businessError: (_copy, code) => code || 'error', confirmation: null, jobs: [],
    apiKey: 'sk-this-is-a-disposable-fixture-key', keyLabel: 'Fixture',
    setError: value => { context.error = value; }, setNotice: noop, setSubmitting: noop, setTab: noop, setKeySaving: noop, setCredential: noop,
    setApiKey: value => { context.apiKey = value; }, refreshAccess: async () => {},
    setConfirmation: value => { context.confirmation = value; },
    setUncertain: value => { context.uncertain = value; },
    setJobs: update => { context.jobs = typeof update === 'function' ? update(context.jobs) : update; },
    fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ generation: { id: 'fixture-job', status: 'processing' }, credential: { last4: 'ture' } }) }; },
  };
  for (const [name, handler] of Object.entries(handlers)) vm.runInNewContext(ts.transpileModule(`globalThis.${name} = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, calls };
}
const event = { preventDefault: noop };
(async () => {
  let { context, calls } = makeContext();
  context.requestConfirmation(event);
  assert.equal(calls.length, 0, 'Opening confirmation has no paid request');
  const firstId = context.confirmation.clientRequestId;
  assert.equal(context.confirmation.parameters.seconds, 5, 'Unsupported discrete duration falls back to reviewed default');
  assert.equal(context.confirmation.parameters.aspect_ratio, '16:9', 'Unsupported stale aspect normalizes');
  assert.equal(context.confirmation.parameters.generate_audio, true, 'Native-only model cannot disable audio');
  context.setConfirmation(null);
  assert.equal(calls.length, 0, 'Cancel has no paid request');
  context.requestConfirmation(event);
  assert.notEqual(context.confirmation.clientRequestId, firstId, 'New confirmation has its own UUID');
  let release;
  context.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); await new Promise(resolve => { release = resolve; }); return { ok: true, status: 200, json: async () => ({ generation: { id: 'fixture-job', status: 'processing' } }) }; };
  const pending = context.submitGeneration();
  await context.submitGeneration();
  assert.equal(calls.length, 1, 'Stale double click submits only once');
  release(); await pending;
  assert.equal(context.confirmation, null);
  assert.equal(context.unresolvedRequest.current, null);
  assert.equal(context.jobs.length, 1);

  ({ context, calls } = makeContext());
  context.requestConfirmation(event);
  context.fetch = async () => { throw new Error('fixture network failure'); };
  await context.submitGeneration();
  assert.equal(context.uncertain, true, 'Network ambiguity locks new paid generation');
  assert.ok(context.unresolvedRequest.current, 'Original UUID remains available for GET recovery');
  context.requestConfirmation(event);
  assert.equal(context.confirmation, null, 'Ambiguous result cannot open another confirmation');

  ({ context, calls } = makeContext());
  context.requestConfirmation(event);
  context.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: { code: 'upstream_unavailable' } }) });
  await context.submitGeneration();
  assert.equal(context.uncertain, true, '502 ambiguity locks new request');

  ({ context, calls } = makeContext());
  context.requestConfirmation(event);
  context.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'invalid_parameters' } }) });
  await context.submitGeneration();
  assert.equal(context.uncertain, false, 'Known validation rejection does not masquerade as a submitted job');
  assert.equal(context.unresolvedRequest.current, null);

  ({ context, calls } = makeContext());
  context.selected = { ...context.selected, nsfw: true };
  context.requestConfirmation(event);
  assert.equal(context.confirmation, null, 'Adult declaration is required before adult-model confirmation');
  assert.equal(context.error, 'age');
  context.selected.nsfw = false; context.prompt = 'sk-never-submit-credentials-in-prompts';
  context.requestConfirmation(event);
  assert.equal(context.confirmation, null, 'Credentials are rejected from prompts');

  ({ context, calls } = makeContext());
  context.selected = { ...context.selected, supportsAudio: false, nativeAudioOnly: false };
  context.requestConfirmation(event);
  assert.equal('generate_audio' in context.confirmation.parameters, false, 'Silent-only models omit audio field entirely');
  context.selected = { ...context.selected, supportsAudio: true, nativeAudioResolutions: ['1080p'] }; context.audio = true;
  context.requestConfirmation(event);
  assert.equal(context.confirmation.parameters.generate_audio, false, 'Kling2.6 at720p cannot request native audio');
  context.assetIds = [1, 2]; context.requestConfirmation(event);
  assert.equal(context.error, 'refs', 'Reference count validates reviewed maximum');

  ({ context, calls } = makeContext());
  context.selected = { ...context.selected, id: 'minimax-h3-max', minSeconds: 5, maxSeconds: 15, defaultSeconds: 5, secondsOptions: undefined, resolutions: ['480p', '768p'], nativeAudioResolutions: ['480p', '768p'], maxReferenceImages: 4 };
  context.seconds = 30; context.resolution = '768p'; context.requestConfirmation(event);
  assert.equal(context.confirmation.parameters.seconds, 15, 'MiniMax stale duration clamps to verified maximum');
  assert.equal(context.confirmation.parameters.resolution, '768p', 'MiniMax native resolution is not rewritten as1080p');
  assert.equal(context.confirmation.parameters.generate_audio, true, 'MiniMax native-only audio remains enabled');

  ({ context, calls } = makeContext());
  await context.saveKey(event);
  assert.equal(calls.length, 1);
  assert.equal(context.apiKey, '', 'Key input is cleared after saving');
  assert.ok(!source.includes('localStorage') && !source.includes('sessionStorage'), 'No credential browser-storage path exists');
  console.log('PASS business UI: actual confirm/cancel/double-click/UUID/unknown/validation/adult/key/audio/duration/aspect/reference handlers; no paid calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
