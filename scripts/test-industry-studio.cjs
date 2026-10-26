/** Real StudioInner render verifies the tab handoff reaches existing Composer props.
 * Job store, React hooks and unrelated viewers are fixtures. No browser-layout or live-generation claims.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
function compile(file, resolve) { const fixtureModule = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: options }).outputText)(resolve, fixtureModule, fixtureModule.exports); return fixtureModule.exports; }
const handoff = compile('lib/industryHandoff.ts', require);
let locale = 'zh-Hant', params, phase, states, cursor, jobs = [], requests = [], subscriptions = [], effects = [], requestHandler;
const jsx = (type, props, key) => ({ type, props: props || {}, key });
function ComposerMarker() {}
const mocks = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
  react: { Suspense: function SuspenseMarker() {}, useEffect(callback) { effects.push(callback); }, useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; }, useSyncExternalStore(subscribe, snapshot, serverSnapshot) { subscriptions.push({ subscribe, snapshot, serverSnapshot }); return phase === 'server' ? serverSnapshot() : snapshot(); } },
  'next/link': function LinkMarker() {},
  'next/navigation': { useRouter: () => ({ push() { throw Error('Opening a handoff cannot navigate automatically'); } }), useSearchParams: () => params },
  '@/lib/i18n/client': { useLocale: () => locale, useTr: () => value => value },
  '@/lib/industryHandoff': handoff,
  '@/lib/officialTemplates': { getOfficialTemplate: id => id === 'legacy-official' ? { id, prompt: 'Unrelated official prompt' } : undefined },
  '@/components/Composer': ComposerMarker,
  '@/lib/jobsStore': { MAX_CONCURRENT_JOBS: 3, useGenerationJobs: () => ({ jobs: [], results: [], startJob: (...args) => jobs.push(args), dismissJob() {} }) },
  '@/lib/jobVisibility': { mainViewerJob: () => null, runningJobCount: () => 0 },
  '@/lib/canvas/director3d': { DIRECTOR3D_HANDOFF_KEY: 'unrelated-3d-fixture' },
  '@/components/Icons': new Proxy({}, { get: () => function IconMarker() {} }),
  '@/components/JobQueue': { __esModule: true, default: function QueueMarker() {}, KIND_ICON: {}, STAGE_LABEL: [], Elapsed: function ElapsedMarker() {} },
  '@/lib/download': { downloadResult() { throw Error('Opening a brief cannot download'); } },
  '@/lib/formatTime': { generationTimeLabel: () => '' },
  '@/lib/modelLabel': { modelLabel: value => value },
};
for (const moduleId of ['@/components/OfficialTemplateComposer', '@/components/LayerDecompositionResult', '@/components/InspirationPanel', '@/components/ExpiringMedia']) mocks[moduleId] = function UnrelatedViewerMarker() {};
const { default: StudioPage } = compile('app/studio/page.tsx', id => { if (id in mocks) return mocks[id]; throw Error('Unexpected Studio dependency: ' + id); });
const flatten = value => value == null || typeof value === 'boolean' ? [] : Array.isArray(value) ? value.flatMap(flatten) : typeof value === 'object' ? [value, ...flatten(value.props?.children)] : [value];
function storage() { const entries = new Map(), reads = [], removals = []; return { entries, reads, removals, getItem: key => { reads.push(key); return entries.get(key) ?? null; }, setItem: (key, value) => entries.set(key, value), removeItem: key => { removals.push(key); entries.delete(key); } }; }
function reset(query = '') { params = new URLSearchParams(query); states = []; cursor = 0; jobs = []; requests = []; subscriptions = []; effects = []; requestHandler = null; global.sessionStorage = storage(); global.window = {}; }
global.fetch = async (...args) => { requests.push(args); if (requestHandler) return requestHandler(...args); throw Error('Handoff render cannot call an API'); };
function render(which = 'client') { phase = which; cursor = 0; effects = []; const page = StudioPage(), inner = flatten(page).find(node => typeof node?.type === 'function' && node.type.name === 'StudioInner'); assert.ok(inner, 'actual StudioInner child'); return flatten(inner.type(inner.props)); }
async function flushEffects() { const cleanup = effects.map(effect => effect()); await new Promise(resolve => setImmediate(resolve)); return cleanup; }
function composer(nodes) { return nodes.find(node => node?.type === ComposerMarker); }
const token = '11111111-2222-4333-8444-555555555555';
const draft = () => ({ token, mode: 'video', prompt: 'Exact reviewed prompt — 青い羽 / & 50%', locale, createdAt: Date.now() });
let checks = 0;
async function test(name, run) { await run(); checks++; console.log('PASS industry studio: ' + name); }
(async () => {
await test('server snapshot holds the composer until client storage is available', () => { reset('mode=video&brief=' + token); handoff.saveIndustryHandoff(sessionStorage, draft()); const tree = render('server'); assert.equal(composer(tree), undefined); assert.equal(tree.some(node => node?.props?.role === 'alert'), false); assert.equal(subscriptions[0].serverSnapshot(), null); assert.equal(jobs.length, 0); assert.equal(requests.length, 0); });
await test('client hydration forwards exact stored prompt and assigns a token-specific composer key', () => { reset('mode=video&brief=' + token); const saved = draft(); handoff.saveIndustryHandoff(sessionStorage, saved); render('server'); const tree = render('client'), target = composer(tree); assert.ok(target); assert.equal(target.props.initialPrompt, saved.prompt); assert.equal(target.props.mode, 'video'); assert.equal(target.key, 'industry-' + token); assert.equal(tree.some(node => node?.props?.role === 'alert'), false); assert.equal(jobs.length, 0); assert.equal(requests.length, 0); assert.equal(subscriptions.at(-1).snapshot(), subscriptions.at(-1).snapshot()); });
await test('refresh reads the same token while a new token gives the composer a fresh identity', () => { reset('mode=video&brief=' + token); handoff.saveIndustryHandoff(sessionStorage, draft()); const first = composer(render()); assert.equal(composer(render()).props.initialPrompt, first.props.initialPrompt); const next = { ...draft(), token: '66666666-7777-4888-8999-000000000000', prompt: 'New reviewed direction', mode: 'image' }; handoff.saveIndustryHandoff(sessionStorage, next); params = new URLSearchParams({ mode: 'image', brief: next.token }); const second = composer(render()); assert.notEqual(second.key, first.key); assert.equal(second.props.initialPrompt, next.prompt); assert.equal(second.props.mode, 'image'); assert.equal(jobs.length, 0); assert.equal(requests.length, 0); });
await test('wrong token, expired record and wrong media mode cannot leak a stored prompt', () => { for (const failure of ['token', 'expiry', 'mode']) { reset('mode=video&brief=' + token); const saved = draft(); if (failure === 'token') saved.token = '99999999-8888-4777-8666-555555555555'; if (failure === 'expiry') saved.createdAt -= 3600001; if (failure === 'mode') saved.mode = 'image'; handoff.saveIndustryHandoff(sessionStorage, saved); const nodes = render(), target = composer(nodes); assert.ok(target); assert.equal(target.props.initialPrompt, undefined); assert.ok(nodes.some(node => node?.props?.role === 'alert')); assert.equal(jobs.length, 0); assert.equal(requests.length, 0); } });
await test('unavailable brief errors are localized in all three interface languages', () => { for (const language of ['zh-Hant', 'en', 'ja']) { locale = language; reset('mode=image&brief=' + token); const nodes = render(), alert = nodes.find(node => node?.props?.role === 'alert'); assert.ok(alert); const words = flatten(alert).filter(item => typeof item === 'string').join(' '); assert.ok(words.includes(language === 'en' ? 'expired' : language === 'ja' ? '有効期限' : '已過期')); } });
await test('ordinary q-based creation remains available when no industry token is present', () => { reset('mode=image&q=Ordinary%20edited%20prompt'); const target = composer(render()); assert.equal(target.key, 'regular-studio'); assert.equal(target.props.initialPrompt, 'Ordinary edited prompt'); assert.equal(target.props.mode, 'image'); assert.equal(jobs.length, 0); assert.equal(requests.length, 0); });
await test('merely opening a brief never starts generation; only the existing explicit submit callback dispatches a job', () => { reset('mode=video&brief=' + token); handoff.saveIndustryHandoff(sessionStorage, draft()); const target = composer(render()); assert.equal(jobs.length, 0); const payload = { prompt: target.props.initialPrompt, model: 'fixture-only', settings: { seconds: 5 } }; target.props.onSubmit(payload); assert.deepEqual(jobs, [['video', payload]]); assert.equal(requests.length, 0); });
await test('valid and invalid incoming briefs neither read nor consume an unrelated 3D draft', async () => {
  for (const available of [true, false]) {
    reset(`mode=video&brief=${token}&q=unrelated-old-prompt&model=unrelated-model&preset=legacy-preset&official=legacy-official`);
    const capture = { refs: [{ id: 82, src: '/api/assets/82/raw', name: 'Private 3D still' }], promptHint: 'Unrelated camera instructions', videoRef: { url: '/api/assets/83/raw' } };
    sessionStorage.setItem('unrelated-3d-fixture', JSON.stringify(capture));
    if (available) handoff.saveIndustryHandoff(sessionStorage, draft());
    const tree = render(), target = composer(tree); assert.ok(target, 'a brief does not wait for a stale preset or open an official template');
    assert.equal(target.props.initialPrompt, available ? draft().prompt : undefined);
    for (const key of ['initialModel', 'initialImgValues', 'initialRefs', 'initialVideoRef', 'initialSettings']) assert.equal(target.props[key], undefined, 'brief cannot inherit ' + key);
    assert.equal(tree.some(node => node?.type === mocks['@/components/OfficialTemplateComposer']), false);
    await flushEffects();
    assert.equal(sessionStorage.reads.includes('unrelated-3d-fixture'), false, '3D draft is not read in a brief context');
    assert.equal(sessionStorage.removals.includes('unrelated-3d-fixture'), false, '3D draft is not consumed');
    assert.equal(sessionStorage.entries.get('unrelated-3d-fixture'), JSON.stringify(capture));
    assert.equal(requests.length, 0, 'brief context cannot load or clone a legacy preset');
    assert.equal(jobs.length, 0);
  }
});
await test('same mounted Studio cannot bleed an acknowledged preset or 3D state into a new or invalid brief', async () => {
  for (const available of [true, false]) {
    reset('mode=video&preset=legacy-preset');
    const capture = { refs: [{ id: 82, src: '/api/assets/82/raw', name: 'Private 3D still' }], promptHint: 'Unrelated camera instructions', videoRef: { url: '/api/assets/83/raw' } };
    sessionStorage.setItem('unrelated-3d-fixture', JSON.stringify(capture));
    requestHandler = async (url, init) => {
      if (url === '/api/home-blocks') return Response.json({ hero: [{ id: 'legacy-preset', prompt: 'Old preset prompt', modelId: 'Old-preset-model', params: { size: 'old-image-size', quality: 'high', n: 3 }, hasImage: true }] });
      if (url === '/api/templates/use' && init.method === 'POST') return Response.json({ ref: { id: 99, src: '/api/assets/99/raw', name: 'Old preset reference' } });
      throw Error('Unexpected legacy fixture request');
    };
    render(); const cleanup = await flushEffects(), legacy = composer(render());
    assert.ok(legacy); assert.equal(legacy.props.initialPrompt, 'Old preset prompt'); assert.equal(legacy.props.initialModel, 'Old-preset-model');
    assert.deepEqual(legacy.props.initialImgValues, { size: 'old-image-size', quality: 'high', n: 3 }); assert.equal(legacy.props.initialRefs[0].id, 99); assert.equal(legacy.props.initialVideoRef.url, capture.videoRef.url);
    assert.ok(sessionStorage.removals.includes('unrelated-3d-fixture'), 'ordinary 3D handoff retains its existing consume-once behavior');
    for (const fn of cleanup) fn?.();
    sessionStorage.setItem('unrelated-3d-fixture', JSON.stringify(capture)); sessionStorage.reads.length = sessionStorage.removals.length = 0;
    if (available) handoff.saveIndustryHandoff(sessionStorage, draft());
    params = new URLSearchParams({ mode: 'video', brief: token, preset: 'another-preset', official: 'legacy-official', q: 'stale-query-prompt' });
    requests.length = 0;
    const tree = render(), target = composer(tree); assert.ok(target); assert.equal(target.props.initialPrompt, available ? draft().prompt : undefined);
    for (const key of ['initialModel', 'initialImgValues', 'initialRefs', 'initialVideoRef', 'initialSettings']) assert.equal(target.props[key], undefined, 'existing state cannot leak ' + key);
    assert.equal(tree.some(node => node?.type === mocks['@/components/OfficialTemplateComposer']), false); await flushEffects(); assert.equal(requests.length, 0); assert.equal(sessionStorage.removals.length, 0); assert.equal(sessionStorage.entries.get('unrelated-3d-fixture'), JSON.stringify(capture)); assert.equal(jobs.length, 0);
  }
});
await test('a late response from an abandoned legacy preset cannot clone material after entering a brief', async () => {
  reset('mode=video&preset=legacy-preset'); let release;
  requestHandler = (url, init) => {
    if (url === '/api/home-blocks') return new Promise(resolve => { release = resolve; });
    if (url === '/api/templates/use') return Response.json({ ref: { id: 99, src: '/api/assets/99/raw', name: 'Abandoned reference' } });
    throw Error('Unexpected late response fixture request: ' + url + ' ' + init?.method);
  };
  render(); const cleanup = effects.map(effect => effect()); assert.equal(requests.length, 1); for (const fn of cleanup) fn?.();
  handoff.saveIndustryHandoff(sessionStorage, draft()); params = new URLSearchParams({ mode: 'video', brief: token }); const current = composer(render()); assert.ok(current); assert.equal(current.props.initialPrompt, draft().prompt); await flushEffects();
  release(Response.json({ hero: [{ id: 'legacy-preset', prompt: 'Abandoned preset', hasImage: true }] })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.filter(([url]) => url === '/api/templates/use').length, 0, 'unmounted preset cannot clone private assets'); const after = composer(render()); assert.equal(after.props.initialRefs, undefined); assert.equal(after.props.initialPrompt, draft().prompt); assert.equal(jobs.length, 0);
});
console.log(`PASS ${checks} actual Studio handoff/render contracts; all jobs and hooks are fixtures, no model calls or paid generation.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
