const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercises the actual paid-confirmation handlers. All fetches are fixtures;
// this script never calls a provider, writes a credential, or spends credits.
const source = fs.readFileSync('components/business/BusinessWorkspace.tsx', 'utf8');
const ast = ts.createSourceFile('BusinessWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
const outputSettings = [];
const outputSettingNames = ['wan3Capability', 'dedicatedMode', 'wan3Text', 'aspectOptions', 'defaultAspect', 'selectedResolution', 'seedanceAdaptive', 'seedanceVideoDuration', 'seedanceAutoDuration', 'selectedAspect', 'selectedSeconds'];
let preSubmitErrorsSource;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['requestConfirmation', 'submitGeneration', 'saveKey'].includes(node.name.getText(ast)) && ts.isArrowFunction(node.initializer)) handlers[node.name.getText(ast)] = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'PRE_SUBMIT_ERRORS') preSubmitErrorsSource = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && outputSettingNames.includes(node.name.getText(ast))) outputSettings.push(`const ${node.getText(ast)};`);
  ts.forEachChild(node, visit);
}
visit(ast);
for (const key of ['requestConfirmation', 'submitGeneration', 'saveKey']) assert.ok(handlers[key], `${key} actual handler found`);
assert.ok(preSubmitErrorsSource, 'Actual pre-submit error set found');
{
  // The preview and expanded viewer share the authenticated download URL.
  const stage = fs.readFileSync('components/business/BusinessStage.tsx', 'utf8');
  const file = ts.createSourceFile('BusinessStage.tsx', stage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let downloadUrl;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'downloadUrl') downloadUrl = node.initializer.getText(file);
    ts.forEachChild(node, walk);
  }
  walk(file);
  assert.ok(downloadUrl);
  const outputPath = '/api/business/media/fixture-account/standard/fixture-video.mp4';
  assert.equal(vm.runInNewContext(downloadUrl, { url: outputPath }), `${outputPath}?download=1`);
  assert.equal(vm.runInNewContext(downloadUrl, { url: `${outputPath}?v=1` }), `${outputPath}?v=1&download=1`);
}
const mentionsModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/businessMentions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mentionsModule, mentionsModule.exports);
const seedanceModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/businessSeedance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(seedanceModule, seedanceModule.exports);
const { getSeedanceCapability, assertBusinessSeedanceReferences, buildBusinessSeedancePayload } = seedanceModule.exports;
const dedicatedModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/businessDedicatedVideo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(dedicatedModule, dedicatedModule.exports);
const { getBusinessDedicatedVideoCapability, buildBusinessDedicatedVideoPayload } = dedicatedModule.exports;
const wan3Module = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/businessWan3.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(wan3Module, wan3Module.exports);
const { getBusinessWan3Capability, buildBusinessWan3Payload } = wan3Module.exports;
const noop = () => {};
function makeContext() {
  let sequence = 0;
  const calls = [];
  const context = {
    crypto: { randomUUID: () => `fixture-request-${++sequence}` },
    submitLock: { current: false }, keyLock: { current: false }, unresolvedRequest: { current: null }, uncertain: false, navigationPending: false,
    selected: { id: 'kling-3.0-turbo', supportsAudio: true, nativeAudioOnly: true, nativeAudioResolutions: ['720p', '1080p'], secondsOptions: [5, 10], defaultSeconds: 5, resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1'], supportsReferences: true, maxReferenceImages: 1, promptMaxChars: 2500, nsfw: false },
    prompt: 'A blue feather moves through a paper theatre.', kind: 'video', seconds: 7, resolution: '720p', size: '', aspect: '21:9', audio: false, assetIds: [],
    mentionBindings: { current: {} }, mentionCopy: { missing: 'missing-reference' }, resolveMentionPrompt: mentionsModule.exports.resolveMentionPrompt, orderMentionReferences: mentionsModule.exports.orderMentionReferences, promptLimit: 12000,
    resultsCopy: { submitted: 'sent' }, historyVersion: { current: 0 }, setSelectedJobId: noop, workspacePreview: { current: null }, requestAnimationFrame: callback => callback(),
    videoMode: 'freestyle', providerAssets: [], referenceOrder: [], outputFormat: 'mp4', seed: '', imageBusinessAssets:[], imageCount:1, imageQuality:'', imageNegative:'', assertBusinessSeedanceReferences, buildBusinessSeedancePayload, buildBusinessDedicatedVideoPayload, buildBusinessWan3Payload,
    dedicatedOptions: {mode:'freestyle',watermark:false,seed:'',negativePrompt:'',promptExtend:false},
    dedicatedCopy: { wan3PromptLimit: 'wan3-prompt-limit' },
    access: { adultVerified: false }, t: { ageRequired: 'age', keyWarning: 'key', uncertain: 'unknown', error: 'error', unavailable: 'offline', submittingNotice: 'sent', keyFormat: 'format', keySaved: 'saved', invalidRequest: 'invalid' }, klingText: { promptLimit: 'long', referenceLimit: 'refs' }, d: { referenceLimitError: 'seedance-refs' },
    REQUEST_HEADERS: { 'Content-Type': 'application/json' }, AbortSignal,
    SUBMISSION_TIMEOUT: 60_000, RECEIPT_EXPIRY: 360_000,
    businessError: (_copy, code) => code || 'error', confirmation: null, jobs: [],
    apiKey: 'sk-this-is-a-disposable-fixture-key', keyLabel: 'Fixture',
    setError: value => { context.error = value; }, setNotice: value => { context.notice = value; }, setSubmitting: noop, setTab: noop, setKeySaving: noop, setCredential: noop,
    resetSelection:noop, setUnavailableModels:noop,setUpstreamTotal:noop, setApiKey: value => { context.apiKey = value; }, refreshAccess: async () => {}, loadModels: async () => { context.catalogReloads = (context.catalogReloads ?? 0) + 1; }, setModels: value => { context.models = value; },
    setConfirmation: value => { context.confirmation = value; },
    setUncertain: value => { context.uncertain = value; },
    saveReceipt: value => { context.unresolvedRequest.current = value; },
    setJobs: update => { context.jobs = typeof update === 'function' ? update(context.jobs) : update; },
    fetch: async (url, init) => { const body = JSON.parse(init.body); calls.push({ url, body }); return { ok: true, status: 200, json: async () => ({ generation: { id: 'fixture-job', clientRequestId: body.clientRequestId, status: 'processing' }, credential: { last4: 'ture' } }) }; },
  };
  vm.runInNewContext(`globalThis.PRE_SUBMIT_ERRORS = ${preSubmitErrorsSource};`, context);
  for (const [name, handler] of Object.entries(handlers)) vm.runInNewContext(ts.transpileModule(`globalThis.${name} = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, calls, uuids: () => sequence };
}
function seedanceContext(modelId = 'NSFW-SIRAYA-Seedance-2.5') {
  const result = makeContext();
  const capability = getSeedanceCapability(modelId);
  result.context.selected = { id: modelId, modality: 'video', nsfw: modelId.startsWith('NSFW-'), supportsAudio: true, supportsReferences: true, resolutions: capability.resolutions, aspectRatios: capability.aspectRatios, minSeconds: capability.minSeconds, maxSeconds: capability.maxSeconds, defaultSeconds: capability.defaultSeconds, maxReferenceImages: capability.references.image, seedance: capability };
  result.context.access.adultVerified = true;
  result.context.seconds = 8; result.context.aspect = '16:9';
  return result;
}
function dedicatedContext(modelId, referenceCount = 0) {
  const result = makeContext(); const c = result.context; const capability = getBusinessDedicatedVideoCapability(modelId) ?? getBusinessWan3Capability(modelId);
  c.selected = { id:modelId,modality:'video',nsfw:false,supportsAudio:capability.supportsAudio,supportsReferences:capability.maxReferenceImages>0,resolutions:capability.resolutions,aspectRatios:capability.aspectRatios,minSeconds:capability.minSeconds,maxSeconds:capability.maxSeconds,defaultSeconds:capability.defaultSeconds,maxReferenceImages:capability.maxReferenceImages,promptMaxChars:capability.promptMaxChars,dedicatedVideo:capability };
  c.seconds=5;c.resolution='720p';c.aspect='16:9';
  c.imageBusinessAssets=Array.from({length:referenceCount},(_,index)=>({id:`upload:${index}`,uploadId:`10000000-0000-4000-8000-${String(index).padStart(12,'0')}`,name:`Own image ${index+1}`,type:'image',status:'processing',storageReady:true}));
  return result;
}
const event = { preventDefault: noop };
function reviewWan3(context) {
  assert.equal(outputSettings.length, outputSettingNames.length, 'Actual editor output settings found');
  Object.assign(context, vm.runInNewContext(`(() => { ${outputSettings.join('\n')} return { selectedResolution, selectedAspect, selectedSeconds, aspectOptions }; })()`, context));
  context.requestConfirmation(event);
}
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
  context.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    await new Promise(resolve => { release = resolve; });
    return { ok: true, status: 202, json: async () => ({ generation: { id: 'fixture-job', clientRequestId: body.clientRequestId, status: 'submitting' } }) };
  };
  const pending = context.submitGeneration();
  await context.submitGeneration();
  assert.equal(calls.length, 1, 'Stale double click submits only once');
  assert.equal(context.confirmation, null, 'The dialog closes while the POST is still waiting');
  assert.equal(calls[0].headers.Prefer, 'respond-async');
  assert.equal(context.unresolvedRequest.current.requestId, calls[0].body.clientRequestId);
  release(); await pending;
  assert.equal(context.confirmation, null);
  assert.equal(context.unresolvedRequest.current, null);
  assert.equal(context.jobs.length, 1);
  assert.equal(context.notice, context.resultsCopy.submitted);
  assert.equal(context.uncertain, false, 'An acknowledged background job leaves the composer available');

  ({ context, calls } = makeContext());
  context.requestConfirmation(event);
  const failedJob = { id: 'provider-rejected-job', clientRequestId: context.confirmation.clientRequestId, status: 'failed', errorCode: 'provider_content_policy' };
  context.fetch = async () => ({ ok: true, status: 201, json: async () => ({ generation: failedJob }) });
  await context.submitGeneration();
  assert.equal(context.jobs[0], failedJob, 'The provider failure stays in the job history');
  assert.equal(context.error, failedJob.errorCode);
  assert.equal(context.notice, '', 'A synchronously failed job must not display the success toast');
  assert.equal(context.uncertain, false);
  assert.equal(context.unresolvedRequest.current, null);

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
  assert.equal(context.error, 'seedance-refs', 'Reference count validates reviewed maximum');

  ({ context, calls } = makeContext());
  context.selected = { ...context.selected, id: 'minimax-h3-max', minSeconds: 5, maxSeconds: 15, defaultSeconds: 5, secondsOptions: undefined, resolutions: ['480p', '768p'], nativeAudioResolutions: ['480p', '768p'], maxReferenceImages: 4 };
  context.seconds = 30; context.resolution = '768p'; context.requestConfirmation(event);
  assert.equal(context.confirmation.parameters.seconds, 15, 'MiniMax stale duration clamps to verified maximum');
  assert.equal(context.confirmation.parameters.resolution, '768p', 'MiniMax native resolution is not rewritten as1080p');
  assert.equal(context.confirmation.parameters.generate_audio, true, 'MiniMax native-only audio remains enabled');

  {
    const result = seedanceContext(); const c = result.context;
    c.providerAssets = [...Array.from({length:30},(_,i)=>({id:`image-${i}`,name:`Image ${i}`,type:'image',status:'active'})),...Array.from({length:10},(_,i)=>({id:`video-${i}`,type:'video',status:'active'})),...Array.from({length:10},(_,i)=>({id:`audio-${i}`,type:'audio',status:'active'}))];
    c.referenceOrder = c.providerAssets.map(asset=>`provider:${asset.id}`);
    c.outputFormat = 'mov'; c.seed = '123'; c.videoMode = 'subject-reference';
    c.requestConfirmation(event);
    assert.ok(c.confirmation, 'NSFW Seedance 2.5 accepts the full fifty-material allocation after age verification');
    assert.equal(c.confirmation.parameters.providerAssets.length,50);
    assert.equal(c.confirmation.parameters.seconds,-1,'Video material changes the visible BYOK request to automatic duration');
    assert.equal(c.confirmation.parameters.output_format,'mov'); assert.equal(c.confirmation.parameters.seed,123);
    assert.deepEqual(Array.from(c.confirmation.parameters.referenceOrder),c.referenceOrder);
    assert.ok(c.confirmation.parameters.providerAssets.every(ref=>Object.keys(ref).sort().join(',')==='id,type'),'Provider display metadata never enters submission');
    assert.equal(result.uuids(),1); assert.equal(result.calls.length,0,'Opening a fifty-reference confirmation still has no paid call');
  }
  {
    const result=seedanceContext(); const c=result.context;
    c.assetIds=[1]; c.providerAssets=[{id:'provider-first',type:'image',status:'active'}]; c.referenceOrder=['provider:provider-first','local:1']; c.videoMode='first-last-frame';
    c.requestConfirmation(event);
    assert.equal(c.confirmation.parameters.aspect_ratio,'adaptive','Seedance 2.5 first-last mode uses the documented adaptive ratio');
    assert.deepEqual(Array.from(c.confirmation.parameters.assetIds),[1]);
    assert.deepEqual(Array.from(c.confirmation.parameters.referenceOrder),['provider:provider-first','local:1'],'Mixed source first/last order survives confirmation');
    assert.equal(c.confirmation.parameters.seconds,8);
  }
  for(const mode of ['video-edit','video-extend']) {
    const result=seedanceContext(); const c=result.context;
    c.providerAssets=[{id:'owned-video',type:'video',status:'active'}]; c.referenceOrder=['provider:owned-video']; c.videoMode=mode;
    c.requestConfirmation(event);
    assert.equal(c.confirmation.parameters.mode,mode); assert.equal(c.confirmation.parameters.seconds,-1); assert.equal(c.confirmation.parameters.aspect_ratio,'adaptive');
    assert.equal(result.calls.length,0);
  }
  for(const mode of ['video-edit','video-extend']) {
    const rejected=seedanceContext(); const c=rejected.context;
    c.providerAssets=[{id:'owned-video',type:'video',status:'active'}]; c.referenceOrder=['provider:owned-video']; c.videoMode=mode; c.prompt='畫'.repeat(12000);
    c.requestConfirmation(event);
    assert.equal(c.confirmation,null,`${mode} includes its provider intent prefix in the 12000-character pre-confirmation limit`);
    assert.equal(c.error,'invalid'); assert.equal(rejected.uuids(),0,'An invalid effective prompt never allocates a paid request UUID'); assert.equal(rejected.calls.length,0);
    const accepted=seedanceContext(); const valid=accepted.context;
    valid.providerAssets=[{id:'owned-video',type:'video',status:'active'}]; valid.referenceOrder=['provider:owned-video']; valid.videoMode=mode; valid.prompt='畫'.repeat(11940);
    valid.requestConfirmation(event);
    assert.ok(valid.confirmation,`${mode} accepts 11940 characters when its prefix fits`);
    assert.equal(valid.confirmation.parameters.prompt,valid.prompt,'Confirmation retains the original user prompt; server applies the prefix once');
    assert.deepEqual(Array.from(valid.confirmation.parameters.referenceOrder),['provider:owned-video'],'Shared scalar preflight does not change the reference-order DTO');
    assert.equal(accepted.uuids(),1); assert.equal(accepted.calls.length,0);
  }
  {
    const result=seedanceContext(); const c=result.context; c.seconds=-1; c.requestConfirmation(event);
    assert.equal(c.confirmation.parameters.seconds,-1,'Explicit automatic duration survives the legacy fixed-duration clamp');
  }
  {
    const result=seedanceContext('SIRAYA-Seedance-2.0'); const c=result.context;
    c.outputFormat='mov'; c.assetIds=Array.from({length:9},(_,i)=>i+1); c.referenceOrder=c.assetIds.map(id=>`local:${id}`); c.requestConfirmation(event);
    assert.ok(c.confirmation); assert.equal(c.confirmation.parameters.assetIds.length,9); assert.equal(c.confirmation.parameters.output_format,undefined,'2.0 does not inherit the 2.5-only output format');
  }
  for(const [name,configure]of [
    ['thirty-one image references',c=>{c.assetIds=Array.from({length:31},(_,i)=>i+1);}],
    ['fifty-one total references',c=>{c.providerAssets=[...Array.from({length:30},(_,i)=>({id:`image-${i}`,type:'image'})),...Array.from({length:10},(_,i)=>({id:`video-${i}`,type:'video'})),...Array.from({length:11},(_,i)=>({id:`audio-${i}`,type:'audio'}))];}],
    ['mixed sources exceeding thirty images',c=>{c.assetIds=Array.from({length:30},(_,i)=>i+1);c.providerAssets=[{id:'extra-image',type:'image'}];}],
    ['first-last with one image',c=>{c.videoMode='first-last-frame';c.assetIds=[1];}],
    ['editing without a video',c=>{c.videoMode='video-edit';c.assetIds=[1];}],
    ['invalid seed',c=>{c.seed='1.5';}],
  ]) {
    const result=seedanceContext(); configure(result.context); result.context.requestConfirmation(event);
    assert.equal(result.context.confirmation,null,`${name} cannot open paid confirmation`); assert.equal(result.uuids(),0,`${name} cannot allocate a request UUID`); assert.equal(result.calls.length,0);
  }
  {
    const result=seedanceContext('SIRAYA-Seedance-2.0'); const c=result.context;
    c.providerAssets=[{id:'audio-only',type:'audio'}]; c.referenceOrder=['provider:audio-only']; c.requestConfirmation(event);
    assert.equal(c.confirmation,null,'2.0 audio-only references fail using the actual shared capability validator'); assert.equal(result.uuids(),0);
  }
  {
    const result=seedanceContext(); const c=result.context; c.access.adultVerified=false; c.requestConfirmation(event);
    assert.equal(c.confirmation,null,'The expanded NSFW reference allowance never bypasses the age gate'); assert.equal(result.uuids(),0);
  }
  {
    const result=seedanceContext(); const c=result.context; c.requestConfirmation(event);
    c.fetch=async()=>({ok:false,status:503,json:async()=>({error:{code:'business_asset_unavailable'}})});
    await c.submitGeneration();
    assert.equal(c.uncertain,false,'Known asset lookup failure is preflight, not an ambiguous paid submission');
    assert.equal(c.unresolvedRequest.current,null,'A preflight asset outage releases the pending UI request UUID');
  }

  for (const [modelId, count] of [['wan2.7-t2v',0],['wan2.7-i2v',1],['wan2.7-r2v',5],['happyhorse-1.1-t2v',0],['happyhorse-1.1-i2v',1],['happyhorse-1.1-r2v',9]]) {
    const result=dedicatedContext(modelId,count);const c=result.context;c.requestConfirmation(event);
    assert.ok(c.confirmation,`${modelId} opens the actual confirmation using native B uploads`);
    assert.equal(result.calls.length,0);assert.equal(result.uuids(),1);
    assert.equal(c.confirmation.parameters.mode,c.selected.dedicatedVideo.capability);
    assert.equal(c.confirmation.parameters.watermark,false);
    assert.equal(c.confirmation.parameters.businessAssetIds?.length??0,count);
    assert.equal(c.confirmation.parameters.assetIds,undefined);
    assert.equal(c.confirmation.parameters.providerAssets,undefined);
    if (c.selected.dedicatedVideo.supportsPersonalReferences && count) {
      assert.deepEqual(Array.from(c.confirmation.parameters.referenceOrder),c.imageBusinessAssets.map(asset=>`business:${asset.uploadId}`));
    } else assert.equal(c.confirmation.parameters.referenceOrder,undefined);
    assert.equal(c.confirmation.parameters.output_format,undefined);
    if(modelId.includes('i2v'))assert.equal(c.confirmation.parameters.aspect_ratio,undefined,'First frame controls the actual output ratio');
    if(modelId.startsWith('happyhorse')){assert.equal(c.confirmation.parameters.generate_audio,undefined);assert.equal(c.confirmation.parameters.prompt_extend,undefined);}
  }
  {
    const result=dedicatedContext('wan2.7-i2v',2);const c=result.context;c.dedicatedOptions={mode:'first-last-frame',seed:'-1',watermark:true,promptExtend:true,negativePrompt:'blurry frames'};c.requestConfirmation(event);
    assert.ok(c.confirmation);assert.equal(c.confirmation.parameters.mode,'first-last-frame');assert.equal(c.confirmation.parameters.seed,-1);assert.equal(c.confirmation.parameters.prompt_extend,true);assert.equal(c.confirmation.parameters.watermark,true);assert.equal(c.confirmation.parameters.negative_prompt,'blurry frames');
    assert.deepEqual(Array.from(c.confirmation.parameters.businessAssetIds),c.imageBusinessAssets.map(asset=>asset.uploadId),'First-last native B source order is preserved');
    assert.equal(result.calls.length,0);
  }
  for(const [name,model,count,configure]of[
    ['missing first frame','happyhorse-1.1-i2v',0,()=>{}],
    ['two first frames without first-last mode','wan2.7-i2v',2,()=>{}],
    ['nine-image overflow','happyhorse-1.1-r2v',10,()=>{}],
    ['five-image overflow','wan2.7-r2v',6,()=>{}],
    ['personal reference IDs on a business-only model','happyhorse-1.1-r2v',1,c=>{c.assetIds=[1];}],
    ['Seedance asset handle','wan2.7-r2v',1,c=>{c.providerAssets=[{id:'asset-only',type:'image'}];}],
    ['invalid seed','happyhorse-1.1-t2v',0,c=>{c.dedicatedOptions.seed='-1';}],
    ['CJK prompt exceeds actual router cap','happyhorse-1.1-t2v',0,c=>{c.prompt='景'.repeat(2501);}],
    ['image on text model','happyhorse-1.1-t2v',1,()=>{}],
  ]) {const result=dedicatedContext(model,count);configure(result.context);result.context.requestConfirmation(event);assert.equal(result.context.confirmation,null,`${name} cannot open paid confirmation`);assert.equal(result.uuids(),0);assert.equal(result.calls.length,0);}

  for (const [model, mode, count, seconds, resolution, aspect] of [
    ['wan3.0-video', 'freestyle', 0, -1, '4k', 'adaptive'],
    ['wan3.0-video-pro', 'image-to-video', 1, 2, '2k', ''],
    ['wan3.0-video-prime', 'first-last-frame', 2, 5, '720p', ''],
    ['wan3.0-video-prime-pro', 'subject-reference', 10, 30, '4k', '9:16'],
  ]) {
    const result = dedicatedContext(model, count), c = result.context;
    Object.assign(c, { seconds, resolution, aspect, audio: true, promptLimit: 2000 });
    Object.assign(c.dedicatedOptions, { mode, seed: '0', promptExtend: true, watermark: true, negativePrompt: 'stale' });
    if (mode === 'subject-reference') {
      c.mentionBindings.current.first = `business:${c.imageBusinessAssets[0].uploadId}`;
      c.prompt = 'The feather in @first begins to glow.';
    }
    reviewWan3(c);
    assert.ok(c.confirmation, `${model}: ${mode} opens the paid review using Wan 3.0 validation`);
    const submitted = c.confirmation.parameters;
    assert.equal(submitted.mode, mode === 'freestyle' ? 'text-to-video' : mode);
    assert.equal(submitted.seconds, seconds, 'Automatic duration and exact boundaries survive confirmation');
    assert.equal(submitted.resolution, mode === 'freestyle' ? '1080p' : resolution, 'Stale or valid resolution matches the displayed value');
    assert.equal(submitted.aspect_ratio, mode === 'freestyle' ? '16:9' : aspect || 'adaptive', 'Only media modes can use adaptive aspect');
    assert.equal(submitted.generate_audio, true);
    assert.equal(submitted.prompt_extend, true);
    assert.equal(submitted.seed, 0);
    assert.equal(submitted.watermark, undefined);
    assert.equal(submitted.negative_prompt, undefined);
    assert.deepEqual(Array.from(submitted.businessAssetIds ?? []), c.imageBusinessAssets.map(asset => asset.uploadId), 'Only private Business Asset IDs are sent in picker order');
    if (mode === 'subject-reference') assert.equal(submitted.prompt, 'The feather in Image 1 begins to glow.');
    assert.equal(result.uuids(), 1);
    assert.equal(result.calls.length, 0);
  }
  {
    const result = dedicatedContext('wan3.0-video-spicy', 1), c = result.context;
    const businessKey = `business:${c.imageBusinessAssets[0].uploadId}`;
    c.assetIds = [61];
    c.referenceOrder = [businessKey,'local:61'];
    c.dedicatedOptions.mode = 'first-last-frame';
    c.mentionBindings.current = { privateImage:'local:61', businessImage:businessKey };
    c.prompt = '@privateImage returns to @businessImage.';
    reviewWan3(c);
    assert.ok(c.confirmation, 'A mixed pair can reach confirmation for an owned Wan Spicy key');
    assert.deepEqual(Array.from(c.confirmation.parameters.assetIds), [61]);
    assert.deepEqual(Array.from(c.confirmation.parameters.referenceOrder), [businessKey,'local:61']);
    assert.equal(c.confirmation.parameters.prompt, 'Image 2 returns to Image 1.');
    assert.equal(result.calls.length, 0);
  }
  for (const [name, count, configure, error] of [
    ['prompt exceeds 2,000 characters', 0, c => { c.prompt = '影'.repeat(2001); }, 'wan3-prompt-limit'],
    ['incomplete first-last pair', 1, c => { c.dedicatedOptions.mode = 'first-last-frame'; }, 'invalid'],
    ['reference overflow', 11, c => { c.dedicatedOptions.mode = 'subject-reference'; }, 'seedance-refs'],
    ['unavailable native upload', 1, c => { c.dedicatedOptions.mode = 'image-to-video'; c.imageBusinessAssets[0].storageReady = false; }, 'invalid'],
    ['personal asset on a text-only mode', 0, c => { c.assetIds = [1]; }, 'invalid'],
    ['out-of-range seed', 0, c => { c.dedicatedOptions.seed = '-1'; }, 'invalid'],
  ]) {
    const result = dedicatedContext('wan3.0-video', count), c = result.context;
    configure(c);
    reviewWan3(c);
    assert.equal(c.confirmation, null, `${name} cannot open paid confirmation`);
    assert.equal(c.error, error);
    assert.equal(result.uuids(), 0);
    assert.equal(result.calls.length, 0);
  }

  ({ context, calls } = makeContext());
  await context.saveKey(event);
  assert.equal(calls.length, 1);
  assert.equal(context.apiKey, '', 'Key input is cleared after saving');
  assert.equal(context.catalogReloads, 1, 'Replacing an already connected key refreshes its model permissions');
  assert.ok(Array.isArray(context.models) && context.models.length === 0, 'Old-key catalog is cleared before refreshing');
  assert.ok(!source.includes('localStorage'));
  const storageWrites = [...source.matchAll(/sessionStorage\.setItem\(([^\n]+)\)/g)].map(match => match[1]);
  assert.deepEqual(storageWrites, ['receiptStorageKey, JSON.stringify({ requestId: receipt.requestId, expiresAt: receipt.expiresAt })'],
    'Only the original request ID and expiry may be persisted in browser storage');
  console.log('PASS business UI: actual confirm/cancel/double-click/UUID/unknown/validation/adult/key/audio/duration/aspect handlers, Seedance 2.0/2.5 references and advanced settings, Wan 3.0 exact settings across all tiers and owned-image modes; no paid calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
