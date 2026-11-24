// Render actual review/setup components in all supported review languages.
// No browser, network, account mutation or generation request is involved.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/')) return load(id.slice(2));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
    return require(id);
  }, module, module.exports);
  return module.exports;
}
const { LocaleProvider } = load('lib/i18n/client.tsx');
const { studioDesignCopy } = load('lib/i18n/studioDesign.ts');
const { businessWorkflowsCopy } = load('lib/i18n/businessWorkflows.ts');
const Review = load('components/business/BusinessWorkflowReview.tsx').default;
const Setup = load('components/business/BusinessSetupProgress.tsx').default;
const node = { id:'test-image', type:'image', x:0, y:0, data:{size:'1024x1024'} };
const render = (locale, component) => renderToStaticMarkup(React.createElement(LocaleProvider, {locale}, component));
for (const locale of ['zh-Hant', 'en', 'ja']) {
  const copy = studioDesignCopy(locale), workflow = businessWorkflowsCopy(locale);
  const unknown = render(locale, React.createElement(Review, { nodes:[{node,label:'Test image'}], onFinish:() => {} }));
  assert.ok(unknown.includes(copy.unknownPrice));
  assert.ok(unknown.includes(copy.acknowledge));
  assert.ok(unknown.includes(workflow.billing));
  assert.match(unknown, /type="checkbox"/);
  assert.match(unknown, new RegExp(`<button[^>]*disabled=""[^>]*>${workflow.start}</button>`));
  const loading = render(locale, React.createElement(Review, { nodes:[{node,label:'Test image',settings:{model:'test',kind:'image',count:1,videoInput:false,referenceCount:0,rewrite:false}}], onFinish:() => {} }));
  assert.ok(loading.includes(copy.checking));
  assert.ok(!loading.includes('type="checkbox"'));
  assert.match(loading, new RegExp(`<button[^>]*disabled=""[^>]*>${workflow.start}</button>`));
  const setup = render(locale, React.createElement(Setup, {step:2}));
  assert.match(setup, new RegExp(`aria-current="step"[^>]*>.*?<strong>${copy.review}</strong>`));
  assert.ok(setup.includes(copy.billingHint));
}
console.log('PASS: Traditional Chinese, English and Japanese setup/review rendering; unknown and loading prices keep generation disabled, billing context is explicit.');
