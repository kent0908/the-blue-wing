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
const { default: Controls, BusinessWan3DurationSelect: WanDuration, DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS: defaults } = read('components/business/BusinessDedicatedVideoControls.tsx');
const { getBusinessDedicatedVideoCapability: caps } = read('lib/businessDedicatedVideo.ts');
const { getBusinessWan3Capability: wanCaps } = read('lib/businessWan3.ts');
const { businessDedicatedVideoCopy } = read('lib/i18n/businessDedicatedVideo.ts');
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
  const wan = wanCaps('wan3.0-video');
  const copy = businessDedicatedVideoCopy(locale);
  for (const [mode, count, max] of [['freestyle', 0, 0], ['image-to-video', 1, 1], ['first-last-frame', 1, 2], ['subject-reference', 3, 10]]) {
    const html = renderToStaticMarkup(React.createElement(Controls, { capability: wan, value: { ...defaults, mode }, onChange: () => {}, referenceCount: count, onOpenAssets: () => {} }));
    assert.equal(html.includes(copy.openAssets), max > 0, `${locale}/${mode}: only image modes link to assets`);
    assert.equal(html.includes(copy.wan3ImageRules), max > 0);
    assert.equal(html.includes(copy.wan3ReferenceInfo), mode === 'subject-reference');
    if (max) assert.ok(html.includes(copy.selected.replace('{count}', String(count)).replace('{max}', String(max))));
    assert.ok(html.includes(copy.wan3Seed));
    assert.ok(html.includes(copy.promptExtend));
    assert.ok(!html.includes(copy.watermarkInfo) && !html.includes('maxlength="4000"'));
    assert.equal((html.match(/<option /g) ?? []).length, 4);
    combinations++;
  }
  const duration = renderToStaticMarkup(React.createElement(WanDuration, { capability: wan, seconds: -1, disabled: true, onChange: () => {} }));
  assert.ok(duration.includes('<select disabled="">'));
  assert.ok(duration.includes(`<option value="-1" selected="">${copy.durationAuto}</option>`));
  assert.ok(duration.includes(`<option value="2">${copy.durationSeconds.replace('{value}', '2')}</option>`));
  assert.ok(duration.includes(`<option value="30">${copy.durationSeconds.replace('{value}', '30')}</option>`));
  assert.equal((duration.match(/<option /g) ?? []).length, 30, 'Auto plus all 29 supported fixed durations');
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
const durationChanges = [];
WanDuration({ capability: wanCaps('wan3.0-video-pro'), seconds: 5, onChange: seconds => durationChanges.push(seconds) }).props.onChange({ target: { value: '-1' } });
assert.deepEqual(durationChanges, [-1], 'Wan 3.0 duration handler preserves the automatic value');
console.log(`PASS business dedicated UI: ${combinations} actual SSR locale/model and mode combinations, localized Wan 3.0 duration range, controlled mode/watermark handlers, native asset action, overflow warning and submission lock; no network or paid calls.`);
