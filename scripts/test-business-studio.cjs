/** Exercises the real BYOK studio navigation and URL state. No network, credentials, DB writes or paid calls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const read = file => fs.readFileSync(file, 'utf8');
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
function load(file, mocks = {}) {
  const fixtureModule = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected import from ${file}: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
function actualHandlers(file, names) {
  const source = read(file);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast)) && node.initializer) {
      const initializer = ts.isArrowFunction(node.initializer) ? node.initializer : ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useCallback' ? node.initializer.arguments[0] : undefined;
      if (initializer && ts.isArrowFunction(initializer)) handlers[node.name.getText(ast)] = initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) assert.ok(handlers[name], `Actual ${name} handler exists`);
  return { source, handlers };
}
function install(handlers, context) {
  for (const [name, handler] of Object.entries(handlers)) {
    vm.runInNewContext(ts.transpileModule(`globalThis.${name} = ${handler};`, { compilerOptions }).outputText, context);
  }
}

const { parseBusinessStudioLocation, businessStudioHref } = load('lib/businessStudio.ts');
const parse = query => parseBusinessStudioLocation(new URLSearchParams(query));
assert.deepEqual(parse(''), { kind: 'image', modelId: '', tab: 'create' }, 'An empty URL starts in the image studio');
for (const kind of ['image', 'video', 'text']) {
  for (const tab of ['create', 'key', 'history']) {
    const location = { kind, modelId: 'minimax-h3', tab };
    const href = businessStudioHref(location);
    const url = new URL(href, 'https://bluewing.example');
    assert.equal(url.origin, 'https://bluewing.example');
    assert.equal(url.pathname, '/business', 'Every studio navigation remains inside the BYOK workspace');
    assert.deepEqual(parse(url.search), location, `URL state round-trips ${kind}/${tab}`);
  }
}
assert.equal(parse('kind=audio&tab=payment&model=https%3A%2F%2Fevil.example').kind, 'image', 'Unknown modality does not select a consumer mode');
assert.equal(parse('kind=audio&tab=payment&model=https%3A%2F%2Fevil.example').tab, 'create', 'Unknown tabs do not route outside the studio');
for (const unsafe of ['https://evil.example', '//evil.example', '<script>', '../secret', 'sk-never-store-a-key-in-a-model-query', 'a'.repeat(500)]) {
  assert.equal(parse(`model=${encodeURIComponent(unsafe)}`).modelId, '', `Invalid model input rejected: ${unsafe.slice(0, 24)}`);
}

// The actual AppFrame must select a different shell for BYOK. Consumer pages
// must retain their usual navigation and help rather than being changed globally.
const jsx = (type, props) => ({ type, props: props ?? {} });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: Symbol('Fragment') };
function flatten(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(flatten);
  if (typeof tree !== 'object') return [tree];
  return [tree, ...flatten(tree.props?.children)];
}
const consumerSidebar = () => null;
const consumerSupport = () => null;
const topBar = () => null;
let pathname = '/business';
const { default: AppFrame } = load('components/AppFrame.tsx', {
  'next/navigation': { usePathname: () => pathname },
  react: { useRef: () => ({ current: null }), Suspense: Symbol('Suspense') },
  'react/jsx-runtime': jsxRuntime,
  './Sidebar': consumerSidebar,
  './TopBar': topBar,
  './SupportChat': consumerSupport,
  'next/link': () => null,
  '@/lib/i18n/business': { businessCopy: () => ({ workspace: 'BYOK Studio' }) },
  '@/lib/i18n/client': { useLocale: () => 'en', useT: () => ({ nav: { mainNav: 'Navigation', closeNav: 'Close navigation', openNav: 'Open navigation' } }) },
});
const child = { type: 'fixture-content', props: {} };
for (const businessPath of ['/business', '/business/project']) {
  pathname = businessPath;
  const tree = flatten(AppFrame({ children: child }));
  assert.ok(tree.includes(child), 'The separate business shell retains page content');
  assert.ok(!tree.some(node => node.type === consumerSidebar), `${businessPath} cannot show the consumer model picker`);
  assert.ok(!tree.some(node => node.type === consumerSupport), `${businessPath} cannot inherit the consumer floating widget`);
  assert.equal(tree.find(node => node.type === topBar)?.props.business, true, 'The account bar receives explicit BYOK context');
}
pathname = '/studio';
const consumerTree = flatten(AppFrame({ children: child }));
assert.ok(consumerTree.some(node => node.type === consumerSidebar), 'Normal studio keeps its consumer navigation');
assert.ok(consumerTree.some(node => node.type === consumerSupport), 'Normal studio keeps its help widget');

// The handlers below run their real function bodies with observed React setters.
// A network call is a test failure, so changing a model/tab cannot spend money.
const { source: workspaceSource, handlers } = actualHandlers('components/business/BusinessWorkspace.tsx', ['resetSelection', 'navigate', 'setTab', 'chooseTab', 'chooseKind', 'chooseModel', 'requestConfirmation', 'chooseVideoMode', 'toggleLocalReference', 'toggleProviderReference']);
function context() {
  const pushes = [];
  const state = {
    kind: 'video', modelId: 'fixture-old-video', tab: 'create', selected: { id: 'fixture-old-video' },
    size: 'old-size', resolution: '4k', assetIds: [71, 72], audio: true, seconds: 30,
    videoMode: 'video-edit', providerAssets: [{id:'old-video',type:'video'}], referenceOrder: ['local:71','provider:old-video','local:72'], outputFormat: 'mov', seed: '123',
    apiKey: 'fixture-unsaved-value', prompt: 'A paper garden opens.', error: 'old-error', notice: 'old-notice',
    confirmation: { clientRequestId: 'fixture-stale-confirmation' }, submitLock: { current: false },
    uncertain: true, unresolvedRequest: { current: 'fixture-original-request' }, navigationPending: false,
    models: [
      { id: 'fixture-image', modality: 'image', displayName: 'Image' },
      { id: 'minimax-h3', modality: 'video', displayName: 'H3', minSeconds: 4, maxSeconds: 15, defaultSeconds: 6 },
      { id: 'fixture-text', modality: 'text', displayName: 'Text' },
    ],
    businessStudioHref,
    startTransition: callback => callback(),
    router: { push: (...args) => pushes.push(args) },
    setSize: value => { state.size = value; },
    setResolution: value => { state.resolution = value; },
    setAssetIds: value => { state.assetIds = typeof value === 'function' ? value(state.assetIds) : value; },
    setVideoMode: value => { state.videoMode = value; },
    setProviderAssets: value => { state.providerAssets = typeof value === 'function' ? value(state.providerAssets) : value; },
    setReferenceOrder: value => { state.referenceOrder = typeof value === 'function' ? value(state.referenceOrder) : value; },
    setOutputFormat: value => { state.outputFormat = value; },
    setSeed: value => { state.seed = value; },
    setAudio: value => { state.audio = value; },
    setSeconds: value => { state.seconds = value; },
    setConfirmation: value => { state.confirmation = value; },
    setApiKey: value => { state.apiKey = value; },
    setError: value => { state.error = value; },
    setNotice: value => { state.notice = value; },
    fetch: () => { throw new Error('Navigation must never start a network or paid request'); },
    crypto: { randomUUID: () => { throw new Error('Locked navigation must not create another paid-request UUID'); } },
  };
  install(handlers, state);
  return { state, pushes };
}
function assertReset(state) {
  assert.equal(state.size, '');
  assert.equal(state.resolution, '');
  assert.deepEqual(Array.from(state.assetIds), []);
  assert.equal(state.videoMode, 'freestyle', 'A new model cannot inherit edit mode');
  assert.deepEqual(Array.from(state.providerAssets), [], 'A new model cannot inherit provider material IDs');
  assert.deepEqual(Array.from(state.referenceOrder), [], 'Frame order resets together with both material sources');
  assert.equal(state.outputFormat, 'mp4');
  assert.equal(state.seed, '');
  assert.equal(state.audio, false);
  assert.equal(state.confirmation, null, 'A stale paid confirmation is removed');
  assert.equal(state.uncertain, true, 'Unknown-request lock survives navigation');
  assert.equal(state.unresolvedRequest.current, 'fixture-original-request', 'The original recovery UUID survives navigation');
  assert.equal(state.prompt, 'A paper garden opens.', 'Switching tools preserves the draft prompt');
}
function assertPush(pushes, expected) {
  assert.equal(pushes.length, 1);
  const [href, options] = pushes[0];
  assert.deepEqual(parse(new URL(href, 'https://bluewing.example').search), expected);
  assert.equal(options.scroll, false, 'Tool navigation preserves workspace scroll');
}
for (const kind of ['image', 'video', 'text']) {
  const { state, pushes } = context();
  state.chooseKind(kind);
  assertReset(state);
  assert.equal(state.apiKey, '', 'Leaving key setup clears unsaved secret input');
  assertPush(pushes, { kind, modelId: '', tab: 'create' });
  state.requestConfirmation({ preventDefault() {} });
  assert.equal(state.confirmation, null, 'Choosing a new modality cannot bypass an unknown submission');
}
for (const tab of ['create', 'key', 'history']) {
  const { state, pushes } = context();
  state.chooseTab(tab);
  assertReset(state);
  assert.equal(state.apiKey, '');
  assert.equal(state.error, '');
  assert.equal(state.notice, '');
  assertPush(pushes, { kind: 'video', modelId: 'fixture-old-video', tab });
}
for (const id of ['fixture-image', 'minimax-h3', 'fixture-text']) {
  const { state, pushes } = context();
  state.chooseModel(id);
  assertReset(state);
  const selected = state.models.find(model => model.id === id);
  assertPush(pushes, { kind: selected.modality, modelId: id, tab: 'create' });
  assert.equal(state.seconds, selected.defaultSeconds ?? 5, 'The model receives its reviewed default duration');
}
{
  const { state, pushes } = context();
  state.chooseModel('not-in-this-account');
  assert.equal(pushes.length, 0, 'An arbitrary model URL cannot select a model outside the account catalog');
  assert.ok(state.confirmation, 'An invalid choice is a no-op');
}
for (const [method, value] of [['chooseModel', 'minimax-h3'], ['chooseKind', 'image'], ['chooseTab', 'history']]) {
  const { state, pushes } = context();
  state.submitLock.current = true;
  state[method](value);
  assert.equal(pushes.length, 0, `An in-flight paid submit cannot be changed by ${method}`);
  assert.ok(state.confirmation, 'An in-flight confirmation remains owned by the original submit');
}
{
  const {state,pushes}=context();
  state.resetSelection(); state.chooseVideoMode('first-last-frame');
  assert.equal(state.videoMode,'first-last-frame'); assert.equal(state.seconds,5); assert.equal(state.confirmation,null);
  state.toggleLocalReference(71); state.toggleProviderReference({id:'provider-image',type:'image',status:'active'}); state.toggleLocalReference(72);
  assert.deepEqual(Array.from(state.referenceOrder),['local:71','provider:provider-image','local:72'],'Reference order follows actual cross-source click order');
  state.toggleLocalReference(71); state.toggleLocalReference(71);
  assert.deepEqual(Array.from(state.referenceOrder),['provider:provider-image','local:72','local:71'],'Removing and reselecting a frame moves it to the end');
  state.toggleProviderReference({id:'provider-image',type:'image',status:'active'});
  assert.equal(state.providerAssets.length,0); assert.deepEqual(Array.from(state.referenceOrder),['local:72','local:71']);
  state.chooseVideoMode('video-edit');
  assert.equal(state.seconds,-1,'Edit mode starts with provider-determined duration');
  assert.deepEqual(Array.from(state.assetIds),[]); assert.deepEqual(Array.from(state.providerAssets),[]); assert.deepEqual(Array.from(state.referenceOrder),[]);
  state.chooseVideoMode('video-extend'); assert.equal(state.seconds,-1);
  assert.equal(pushes.length,0,'Changing modes and frame references does not navigate, fetch or submit');
  assert.equal(state.uncertain,true,'Changing modes cannot clear an ambiguous prior paid request');
}
{
  const {state}=context(); state.submitLock.current=true;
  const before=JSON.stringify({mode:state.videoMode,assets:state.assetIds,provider:state.providerAssets,order:state.referenceOrder,seconds:state.seconds});
  state.chooseVideoMode('first-last-frame'); state.toggleLocalReference(99); state.toggleProviderReference({id:'inflight-provider',type:'image'});
  assert.equal(JSON.stringify({mode:state.videoMode,assets:state.assetIds,provider:state.providerAssets,order:state.referenceOrder,seconds:state.seconds}),before,'An in-flight paid submit locks mode and both reference sources');
}
{
  const { state, pushes } = context();
  let uuids = 0;
  state.uncertain = false;
  state.unresolvedRequest.current = null;
  state.confirmation = null;
  state.assetIds = [];
  state.navigationPending = true;
  state.crypto.randomUUID = () => `fixture-transition-request-${++uuids}`;
  state.requestConfirmation({ preventDefault() {} });
  assert.equal(state.confirmation, null, 'A pending URL transition cannot open a paid confirmation with the old model');
  assert.equal(uuids, 0, 'A pending URL transition cannot allocate a new paid-request UUID');
  assert.equal(pushes.length, 0, 'A blocked confirmation does not navigate or submit');
  state.navigationPending = false;
  state.requestConfirmation({ preventDefault() {} });
  assert.equal(uuids, 1, 'Confirmation is available once URL navigation has finished');
  assert.equal(state.confirmation.clientRequestId, 'fixture-transition-request-1');
}
assert.ok(workspaceSource.includes('parseBusinessStudioLocation(search)'), 'Rendered modality/model/tab come from the current URL, including browser back/forward');

const workspaceAst = ts.createSourceFile('BusinessWorkspace.tsx', workspaceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let locationEffect;
let generateDisabled;
function findLocationEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(workspaceAst) === 'useEffect' && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])) {
    const dependencies = node.arguments[1].elements.map(item => item.getText(workspaceAst));
    if (['kind', 'modelId', 'tab', 'resetSelection'].every(item => dependencies.includes(item))) locationEffect = node.arguments[0].getText(workspaceAst);
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(workspaceAst) === 'button') {
    const disabled = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(workspaceAst) === 'disabled');
    if (disabled?.initializer && ts.isJsxExpression(disabled.initializer) && disabled.initializer.expression?.getText(workspaceAst).includes('navigationPending')) generateDisabled = disabled.initializer.expression.getText(workspaceAst);
  }
  ts.forEachChild(node, findLocationEffect);
}
findLocationEffect(workspaceAst);
assert.ok(locationEffect, 'Browser back/forward has an actual model-dependent state reset effect');
assert.ok(generateDisabled, 'The actual generate control includes the URL-transition lock');
{
  const { state } = context();
  state.submitting = false; state.uncertain = false; state.selected = { id: 'fixture-model', nsfw: false };
  state.navigationPending = true;
  assert.equal(vm.runInNewContext(generateDisabled, state), true, 'The actual generation button is disabled during URL transition');
  state.navigationPending = false;
  assert.equal(vm.runInNewContext(generateDisabled, state), false, 'The generation button is available after navigation settles');
}
{
  const { state, pushes } = context();
  install({ onLocationChanged: locationEffect }, state);
  state.onLocationChanged();
  assertReset(state);
  assert.equal(pushes.length, 0, 'A URL change does not create another history entry');
}

// Render the real navigation component into a lightweight JSX tree and invoke
// its real button handlers. Both responsive copies are tested without a DOM.
const { businessStudioCopy } = load('lib/i18n/businessStudio.ts');
const { businessCopy } = load('lib/i18n/business.ts');
let currentSearch = '';
let detailsRef = { current: { open: true } };
const icons = Object.fromEntries(['IconImage', 'IconVideo', 'IconChat', 'IconHistory', 'IconWing'].map(name => [name, function fixtureIcon() {}]));
const { default: BusinessStudioNav } = load('components/business/BusinessStudioNav.tsx', {
  react: { useId: () => 'fixture-search', useState: () => [currentSearch, value => { currentSearch = value; }], useRef: () => detailsRef },
  'react/jsx-runtime': jsxRuntime,
  'next/link': function fixtureLink() {},
  '@/components/Icons': icons,
  '@/components/ModelLogo': function fixtureModelLogo() {},
  './BusinessStudio.module.css': new Proxy({}, { get: (_target, name) => String(name) }),
});
function navProps(locale = 'en') {
  const events = [];
  const props = {
    copy: businessStudioCopy(locale), business: businessCopy(locale), approved: true, keyConfigured: true, modelsLoading: false,
    models: [
      { id: 'fixture-image', displayName: 'Fixture Image', modality: 'image', nsfw: false },
      { id: 'minimax-h3', displayName: 'MiniMax H3', modality: 'video', nsfw: false },
      { id: 'kling-3.0', displayName: 'Kling 3.0', modality: 'video', nsfw: false },
      { id: 'fixture-text', displayName: 'Fixture Text', modality: 'text', nsfw: false },
    ],
    kind: 'video', selectedId: 'minimax-h3', tab: 'create',
    onKind: value => events.push(['kind', value]),
    onModel: value => events.push(['model', value]),
    onTab: value => events.push(['tab', value]),
  };
  return { props, events };
}
function buttonFor(tree, label) { return flatten(tree).find(node => node.type === 'button' && flatten(node.props.children).includes(label)); }
for (const locale of ['zh-Hant', 'en', 'ja']) {
  const { props, events } = navProps(locale);
  for (const [key, value] of Object.entries(props.copy)) assert.ok(typeof value === 'string' && value.trim(), `${locale} copy ${key} exists`);
  const tree = BusinessStudioNav(props);
  for (const [kind, title] of [['image', 'imageTitle'], ['video', 'videoTitle'], ['text', 'textTitle']]) {
    currentSearch = 'stale filter'; detailsRef.current.open = true; events.length = 0;
    const button = buttonFor(tree, props.copy[title]);
    assert.ok(button && !button.props.disabled, `${locale} ${kind} has an enabled native button`);
    assert.equal(button.props['aria-pressed'], kind === 'video');
    button.props.onClick();
    assert.deepEqual(events, [['kind', kind]], 'Choosing a studio emits one navigation, avoiding duplicate router history entries');
    assert.equal(currentSearch, '', 'Choosing another modality clears the old model search');
    assert.equal(detailsRef.current.open, false, 'Choosing another modality closes the mobile model menu');
  }
  for (const [label, tab] of [[props.business.keyTab, 'key'], [props.business.historyTab, 'history']]) {
    events.length = 0;
    buttonFor(tree, label).props.onClick();
    assert.deepEqual(events, [['tab', tab]], 'Utility controls open only their matching business view');
  }
  const links = flatten(tree).filter(node => node.props?.href);
  assert.equal(links.length, 1, 'There is only one explicit consumer-return link');
  assert.equal(links[0].props.href, '/studio');
  assert.ok(flatten(links[0].props.children).includes(props.copy.returnConsumer), 'The consumer-return link is clearly labeled in each language');
}
{
  currentSearch = '';
  const { props, events } = navProps();
  let tree = BusinessStudioNav(props);
  const modelButtons = flatten(tree).filter(node => node.type === 'button' && node.props.title === 'MiniMax H3');
  assert.equal(modelButtons.length, 2, 'Both desktop and mobile model lists show the same account model');
  for (const button of modelButtons) {
    events.length = 0; detailsRef.current.open = true;
    button.props.onClick();
    assert.deepEqual(events, [['model', 'minimax-h3']], 'A model selection triggers exactly one account-scoped choice');
    assert.equal(detailsRef.current.open, false, 'Selecting a model collapses mobile details');
  }
  const inputs = flatten(tree).filter(node => node.type === 'input' && node.props.type === 'search');
  assert.equal(inputs.length, 2);
  assert.notEqual(inputs[0].props.id, inputs[1].props.id, 'Responsive search controls have separate accessible IDs');
  inputs[0].props.onChange({ target: { value: '  KLING  ' } });
  tree = BusinessStudioNav(props);
  assert.equal(flatten(tree).filter(node => node.type === 'button' && node.props.title === 'MiniMax H3').length, 0, 'Search filters actual account models');
  assert.equal(flatten(tree).filter(node => node.type === 'button' && node.props.title === 'Kling 3.0').length, 2, 'Search is case-insensitive and trims whitespace');
  inputs[1].props.onChange({ target: { value: 'no-match' } });
  assert.ok(flatten(BusinessStudioNav(props)).includes(props.copy.noResults), 'An empty search has useful feedback');
  currentSearch = '';
  assert.ok(!flatten(BusinessStudioNav({ ...props, kind: 'text' })).some(node => node.props?.title === 'MiniMax H3'), 'Switching modality cannot leak a video model into the text list');
  const unapproved = BusinessStudioNav({ ...props, approved: false });
  assert.equal(flatten(unapproved).filter(node => node.type === 'button' && node.props.title).length, 0, 'Unapproved viewers cannot see a fabricated model catalog');
  assert.equal(buttonFor(unapproved, props.copy.imageTitle).props.disabled, true, 'Creation tools stay disabled before approval');
  const noKey = BusinessStudioNav({ ...props, keyConfigured: false });
  assert.equal(flatten(noKey).filter(node => node.type === 'button' && node.props.title).length, 0, 'No key means no usable catalog is invented');
  assert.ok(flatten(noKey).includes(props.copy.keyNotConnected), 'No-key state explains how to unlock the catalog');
  assert.equal(buttonFor(noKey, props.business.keyTab).props.disabled, false, 'An approved account can still open key setup');
}

const { default: JobToasts } = load('components/JobToasts.tsx', {
  'react/jsx-runtime': jsxRuntime, 'next/link': function fixtureLink() {},
  'next/navigation': { usePathname: () => pathname },
  './Icons': { ...icons, IconClose: function fixtureClose() {}, IconCheck: function fixtureCheck() {} },
  '@/lib/jobsStore': { useGenerationJobs: () => ({ toasts: [{ id: 'fixture-consumer-job', title: 'Image ready', detail: 'Fixture', mode: 'image', ok: true }], dismissToast: () => {} }) },
  '@/lib/i18n/client': { useTr: () => value => value },
});
for (const path of ['/business', '/business/project']) {
  pathname = path;
  assert.equal(JobToasts(), null, 'Consumer generation notifications are absent in the independent business studio');
}
pathname = '/studio';
assert.ok(JobToasts(), 'Consumer job notifications continue working in the normal studio');
console.log('PASS business studio: URL validation/roundtrip, actual model/kind/tab actions, back-forward reset, unknown-request preservation, in-flight and URL-transition confirmation/button locks, responsive nav, real search, three-language labels, approval/key states and consumer-shell/toast isolation; no network or paid calls.');

