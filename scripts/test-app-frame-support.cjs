/* Render the real AppFrame and TopBar with React SSR. No browser, API or paid calls. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const cache = new Map();
let currentPath = '/canvas';
const navigation = {
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() { throw Error('SSR cannot navigate'); }, refresh() { throw Error('SSR cannot refresh'); } }),
};
function resolveFile(file) {
  for (const candidate of [file, `${file}.tsx`, `${file}.ts`]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  throw Error(`Missing fixture import ${file}`);
}
function load(file) {
  file = resolveFile(path.resolve(root, file));
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  const localRequire = id => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (id === 'next/navigation') return navigation;
    if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (id === './Sidebar') return { __esModule: true, default: () => React.createElement('aside', { 'data-fixture-sidebar': true }) };
    if (id === './SupportChat') return { __esModule: true, default: () => React.createElement('aside', { 'data-fixture-support': true }) };
    if (id === './AccountDialog') return { __esModule: true, default: () => null };
    if (id.startsWith('@/')) return load(id.slice(2));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
    throw Error(`Unhandled AppFrame fixture import ${id}`);
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}
const AppFrame = load('components/AppFrame.tsx').default;
const SupportChat = load('components/SupportChat.tsx').default;
const { LocaleProvider } = load('lib/i18n/client.tsx');
const routes = [
  ['/canvas', true, true],
  ['/canvas/63', false, true],
  ['/canvas/director3d', false, true],
  ['/canvas/templates/1', false, true],
  ['/canvas-extra', true, true],
  ['/studio', true, true],
  ['/companions/1', true, true],
  ['/business', false, true],
  ['/business/workflows/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false, true],
  ['/landing', false, false],
  ['/crm', false, false],
  ['/admin/users', false, false],
];
const previousFetch = global.fetch;
let calls = 0;
global.fetch = () => { calls++; throw Error('SSR fixture must not call an API'); };
try {
  let passed = 0;
  for (const locale of ['zh-Hant', 'en', 'ja']) {
    for (const [route, support, help] of routes) {
      currentPath = route;
      const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale },
        React.createElement(AppFrame, null, React.createElement('section', { 'data-fixture-content': true }, 'Canvas content'))));
      assert.equal(html.includes('data-fixture-support="true"'), support, `${locale} ${route}: floating support visibility`);
      assert.equal(html.includes('href="/help"'), help, `${locale} ${route}: real TopBar help remains available`);
      assert.ok(html.includes('data-fixture-content="true"'), `${locale} ${route}: route content remains rendered`);
      if (route === '/canvas/63') {
        assert.ok(html.includes('data-fixture-sidebar="true"'), `${locale}: consumer navigation shell remains rendered`);
        assert.ok(html.includes('role="menu"') === false, 'Language menu stays closed during SSR');
      }
      passed++;
    }
  }
  assert.equal(calls, 0);
  for (const locale of ['zh-Hant', 'en', 'ja']) {
    for (const [route, raised] of [['/', true], ['/companions/1', true], ['/studio', false]]) {
      currentPath = route;
      const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale }, React.createElement(SupportChat)));
      assert.equal(html.includes('bottom-28'), raised, `${locale} ${route}: support stays clear of bottom creation controls`);
      assert.ok(html.includes('aria-label='), 'Support remains accessible and available');
    }
  }
  console.log(`PASS AppFrame support: ${passed} actual React SSR route/language cases; real TopBar help, child content and consumer shell preserved; zero API or paid calls.`);
  console.log('PASS SupportChat: 9 real React SSR route/language cases; homepage composer clearance, companion position and normal studio position.');
} finally {
  global.fetch = previousFetch;
}
