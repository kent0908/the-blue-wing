/* Exercises the actual dedicated BYOK controls in all three locales, then
 * invokes their controlled handlers. No browser, network, credentials or fees.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let locale = 'zh-Hant';
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
function loader(hookMock = false) {
  const cache = {};
  function read(path) {
    if (cache[path]) return cache[path];
    const fixtureModule = { exports: {} };
    const requireFixture = name => {
      if (name === 'react') return hookMock ? { useId: () => 'fixture-controlled-id' } : React;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === '@/lib/i18n/client') return { useLocale: () => locale };
      if (name === '@/lib/i18n/businessDedicatedVideo') return read('lib/i18n/businessDedicatedVideo.ts');
      if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      throw new Error(`Unexpected import from ${path}: ${name}`);
    };
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions }).outputText)(requireFixture, fixtureModule, fixtureModule.exports);
    return cache[path] = fixtureModule.exports;
  }
  return read;
}
const read = loader();
const { default: Controls, DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS: defaults } = read('components/business/BusinessDedicatedVideoControls.tsx');
const { getBusinessDedicatedVideoCapability: caps } = read('lib/businessDedicatedVideo.ts');
let combinations = 0;
for (locale of ['zh-Hant', 'en', 'ja']) {
  for (const model of ['wan2.7-t2v', 'wan2.7-i2v', 'wan2.7-r2v', 'happyhorse-1.1-t2v', 'happyhorse-1.1-i2v', 'happyhorse-1.1-r2v']) {
    const html = renderToStaticMarkup(React.createElement(Controls, { capability: caps(model), value: defaults, onChange: () => {}, referenceCount: 0, onOpenAssets: () => {} }));
    const context = `${locale}/${model}`;
    assert.ok(!html.includes('undefined'), `${context}: every translation resolves`);
    assert.ok(!html.includes('<form'), `${context}: controls do not nest a form inside the studio form`);
    assert.ok(html.includes('class="controls"'), `${context}: CSS-module class is applied`);
    assert.ok(html.includes('type="checkbox"'), `${context}: explicit watermark control is present`);
    assert.equal(/maxLength="4000"/i.test(html), model.startsWith('wan'), `${context}: negative prompt is Wan-only`);
    assert.equal(html.includes('<select'), model === 'wan2.7-i2v', `${context}: only Wan i2v exposes the first-last choice`);
    assert.equal(html.includes('400 px'), model.startsWith('happyhorse') && !model.endsWith('t2v'), `${context}: HappyHorse image floor is visible`);
    assert.equal(html.includes('[Image 1]'), model === 'happyhorse-1.1-r2v', `${context}: positional reference labels are precise`);
    assert.equal(html.includes('name="apiKey"'), false, `${context}: no API key input or credential request is introduced`);
    assert.ok(html.includes(`/${model.startsWith('wan') ? 'wan' : 'happyhorse'}/`), `${context}: documentation targets the actual provider family`);
    combinations++;
  }
}
function flatten(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(flatten);
  return [tree, ...flatten(tree.props?.children)];
}
const { default: Controlled } = loader(true)('components/business/BusinessDedicatedVideoControls.tsx');
locale = 'en';
const changes = [];
const value = { ...defaults };
let opened = 0;
const props = { capability: caps('wan2.7-i2v'), value, onChange: next => changes.push(next), referenceCount: 1, onOpenAssets: () => { opened++; } };
const nodes = flatten(Controlled(props));
nodes.find(node => node.type === 'select').props.onChange({ target: { value: 'first-last-frame' } });
assert.equal(changes.at(-1).mode, 'first-last-frame', 'Native mode handler emits the first-last contract');
assert.equal(value.mode, 'freestyle', 'Controlled input objects are never mutated');
nodes.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
assert.equal(changes.at(-1).watermark, true, 'Watermark change is retained in the parent DTO');
nodes.find(node => node.type === 'button').props.onClick();
assert.equal(opened, 1, 'Asset action is delegated to the existing business asset interface');
const before = changes.length;
const locked = flatten(Controlled({ ...props, disabled: true }));
assert.equal(locked[0].props.disabled, true, 'The entire native fieldset locks during submission');
locked.find(node => node.type === 'select').props.onChange({ target: { value: 'first-last-frame' } });
assert.equal(changes.length, before, 'A stale handler cannot mutate locked settings');
const overflow = renderToStaticMarkup(React.createElement(Controls, { ...props, referenceCount: 3 }));
assert.ok(overflow.includes('role="alert"'), 'An over-capacity source selection produces a visible warning');
assert.equal(Controlled({ ...props, capability: caps('happyhorse-1.0-video-edit') }), null, 'Unintegrated video-edit is not advertised as usable');
console.log(`PASS business dedicated UI: ${combinations} actual SSR locale/model combinations, controlled mode/watermark handlers, native asset action, overflow warning and submission lock; no network or paid calls.`);
