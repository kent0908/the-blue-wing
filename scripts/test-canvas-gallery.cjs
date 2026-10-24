/* Exercises actual consumer gallery event handlers. All network responses are fixtures; no account, database, or paid calls. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const ts = require(path.join(repo, 'node_modules/typescript'));
let state, index, locale = 'zh-Hant', calls = [], response = { ok: true };
const jsx = (type, props, key) => ({ type, props: props || {}, key });
const mockLink = function Link() {};
const mocks = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
  react: { useCallback: fn => fn, useEffect() {}, useRef: value => ({ current: value }), useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; } },
  'next/navigation': { useRouter: () => ({ push() {} }) },
  'next/link': mockLink,
  'next/image': function Image() {},
  './gallery.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  '@/components/canvas/CanvasVideoPreview': function Video() {},
  '@/components/canvas/ShareWorkflowDialog': function Share() {},
  '@/components/Icons': new Proxy({}, { get: () => function Icon() {} }),
  '@/lib/i18n/client': { useLocale: () => locale, useTr: () => text => text },
};
const moduleFixture = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.join(repo, 'app/canvas/page.tsx'), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(name => { if (name in mocks) return mocks[name]; throw Error('Unexpected import: ' + name); }, moduleFixture, moduleFixture.exports);
const render = () => { index = 0; return moduleFixture.exports.default(); };
const flatten = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(flatten) : typeof tree === 'object' ? [tree, ...flatten(tree.props?.children)] : [tree];
const elements = () => flatten(render()).filter(item => item && typeof item === 'object');
const work = { id: 'one', name: 'A cobalt feather', nodeCount: 3, updatedAt: '2026-10-20T08:00:00Z' };
function reset() { state = { 1: [work], 2: [], 3: [], 4: true }; index = 0; calls = []; response = { ok: true }; }
global.fetch = async (url, init) => { calls.push({ url, init }); return response; };
global.document = { activeElement: null };
global.confirm = () => { throw Error('Native confirmation is forbidden in tested gallery delete flow'); };
const click = { preventDefault() {}, stopPropagation() {} };
const flush = () => new Promise(resolve => setImmediate(resolve));
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  await test('workflow controls are semantic siblings of the navigation link', () => { reset(); const nodes = elements(); const link = nodes.find(node => node.type === mockLink && node.props.href === '/canvas/one'); assert.ok(link); assert.equal(flatten(link).some(node => node?.type === 'button'), false); assert.ok(nodes.find(node => node.props?.['aria-label'] === '刪除')); });
  await test('personal search filters actual workflow names and has translated labels', () => { for (const [lang, label] of [['zh-Hant', '搜尋我的畫布'], ['en', 'Search my canvases'], ['ja', 'マイキャンバスを検索']]) { reset(); locale = lang; const input = elements().find(node => node.type === 'input' && node.props.type === 'search'); assert.equal(input.props.placeholder, label); input.props.onChange({ target: { value: 'MISSING' } }); assert.equal(elements().some(node => node.type === mockLink && node.props.href === '/canvas/one'), false); input.props.onChange({ target: { value: 'COBALT' } }); assert.ok(elements().find(node => node.type === mockLink && node.props.href === '/canvas/one')); } });
  await test('dates use the current zh/en/ja locale and retain the machine timestamp', () => { for (const lang of ['zh-Hant', 'en', 'ja']) { reset(); locale = lang; const time = elements().find(node => node.type === 'time'); assert.equal(time.props.dateTime, work.updatedAt); assert.equal(time.props.children, new Date(work.updatedAt).toLocaleDateString(lang === 'zh-Hant' ? 'zh-TW' : lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })); } });
  await test('delete opens a named page dialog before any network mutation', () => { reset(); locale = 'en'; elements().find(node => node.props?.['aria-label'] === '刪除').props.onClick(click); assert.equal(calls.length, 0); const dialog = elements().find(node => node.props.role === 'alertdialog'); assert.ok(dialog); assert.equal(dialog.props['aria-modal'], 'true'); assert.ok(flatten(dialog).includes(work.name)); });
  await test('cancel closes the dialog without deleting', () => { reset(); elements().find(node => node.props?.['aria-label'] === '刪除').props.onClick(click); const dialog = elements().find(node => node.props.role === 'alertdialog'); flatten(dialog).find(node => node?.type === 'button' && node.props.children === '取消').props.onClick(); assert.equal(state[9], null); assert.equal(calls.length, 0); assert.equal(state[1].length, 1); });
  await test('failed DELETE preserves saved work and leaves an actionable error', async () => { reset(); elements().find(node => node.props?.['aria-label'] === '刪除').props.onClick(click); response = { ok: false }; const dialog = elements().find(node => node.props.role === 'alertdialog'); flatten(dialog).find(node => node?.type === 'button' && node.props.children === '刪除').props.onClick(); await flush(); assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/canvas/one'); assert.equal(calls[0].init.method, 'DELETE'); assert.equal(state[1].length, 1); assert.ok(state[9]); assert.ok(state[11]); assert.equal(state[10], false); });
  await test('successful DELETE removes only the confirmed workflow and closes dialog', async () => { reset(); state[1].push({ ...work, id: 'two', name: 'Other draft' }); elements().find(node => node.props?.['aria-label'] === '刪除').props.onClick(click); const dialog = elements().find(node => node.props.role === 'alertdialog'); flatten(dialog).find(node => node?.type === 'button' && node.props.children === '刪除').props.onClick(); await flush(); assert.deepEqual(state[1].map(row => row.id), ['two']); assert.equal(state[9], null); });
  console.log('Consumer gallery actual-handler checks: ' + checks + ' PASS; no live or paid requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
