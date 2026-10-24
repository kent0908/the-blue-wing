/* Executes real CanvasEditor handlers with local DOM/network fixtures. No browser, account, provider, or paid calls. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
const source = fs.readFileSync(path.join(root, 'components/canvas/CanvasEditor.tsx'), 'utf8');
const ast = ts.createSourceFile('CanvasEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
let panEffect;
const wanted = ['focusNode', 'zoomAtCenter', 'fitCanvas', 'save', 'exportDraft'];
function visit(node) {
  if (ts.isVariableDeclaration(node) && wanted.includes(node.name.getText(ast))) {
    const expression = ts.isArrowFunction(node.initializer) ? node.initializer : ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : null;
    assert.ok(expression && ts.isArrowFunction(expression));
    handlers[node.name.getText(ast)] = expression.getText(ast);
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('if (!interaction) return;')) panEffect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
for (const name of wanted) assert.ok(handlers[name], 'Actual handler: ' + name);
assert.ok(panEffect, 'Actual pan/drag/resize effect');
function install(context, names = wanted) {
  for (const name of names) vm.runInNewContext(ts.transpileModule(`globalThis.${name} = ${handlers[name]};`, { compilerOptions: options }).outputText, context);
  return context;
}
function pure(file) {
  const fixtureModule = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: options }).outputText)(fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const { CanvasSaveState, CanvasRunLock } = pure('lib/canvas/saveState.ts');
const graph = { nodes: [{ id: 'left', type: 'text', x: -100, y: -70, data: { text: 'Private draft' } }, { id: 'right', type: 'image', width: 320, x: 550, y: 250, data: { model: 'private-image' } }], edges: [] };
function viewport(width = 390, height = 700) {
  const state = { NODE_WIDTH: 260, containerRef: { current: { getBoundingClientRect: () => ({ width, height }) } }, graphRef: { current: structuredClone(graph) }, zoomRef: { current: 1 }, panRef: { current: { x: 80, y: 60 } }, portOffsets: new Map([['left', { __bounds: { x: 260, y: 240 } }], ['right', { __bounds: { x: 320, y: 350 } }]]), updates: 0, fetch() { throw Error('Viewport changes must never call an API'); } };
  state.setZoom = value => { state.zoom = value; state.updates++; };
  state.setPan = value => { state.pan = value; state.updates++; };
  state.setSelectedNode = value => { state.selected = value; state.updates++; };
  return install(state, ['focusNode', 'zoomAtCenter', 'fitCanvas']);
}
const close = (actual, expected, note) => assert.ok(Math.abs(actual - expected) < 1e-8, note + ': ' + actual + ' vs ' + expected);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS canvas workspace: ' + name); }
(async () => {
  await test('phone node navigation centers the chosen card and updates refs immediately', () => {
    for (const width of [320, 390]) {
      const state = viewport(width); state.focusNode('right');
      const node = state.graphRef.current.nodes[1], left = node.x * state.zoom + state.pan.x, right = left + node.width * state.zoom;
      assert.ok(left >= 31.99 && right <= width - 31.99, 'chosen card keeps usable screen gutters'); close((left + right) / 2, width / 2, 'chosen card center'); close(node.y * state.zoom + state.pan.y, 52, 'top screen inset');
      assert.equal(state.selected, 'right'); assert.equal(state.zoomRef.current, state.zoom); assert.equal(state.panRef.current, state.pan);
      assert.deepEqual(state.graphRef.current, graph, 'navigation cannot alter a saved graph');
    }
  });
  await test('missing node or absent canvas is a no-op', () => { const state = viewport(); state.focusNode('missing'); assert.equal(state.updates, 0); state.containerRef.current = null; state.focusNode('right'); state.zoomAtCenter(1.2); state.fitCanvas(); assert.equal(state.updates, 0); });
  await test('zoom preserves the world point under the viewport center through consecutive operations', () => {
    const state = viewport(); state.focusNode('right');
    const world = () => ({ x: (195 - state.panRef.current.x) / state.zoomRef.current, y: (350 - state.panRef.current.y) / state.zoomRef.current });
    const before = world();
    for (const factor of [1.2, 1.2, 1 / 1.2, 50, .0001, 1.2]) {
      state.zoomAtCenter(factor); close(world().x, before.x, 'world center x'); close(world().y, before.y, 'world center y');
      assert.ok(state.zoom >= .15 && state.zoom <= 2.5); assert.equal(state.panRef.current, state.pan);
    }
  });
  await test('fit-to-view uses measured node extents, including negative positions', () => {
    const state = viewport(1200, 900); state.fitCanvas();
    for (const node of graph.nodes) { const left = node.x * state.zoom + state.pan.x, top = node.y * state.zoom + state.pan.y; const right = left + (node.width || 260) * state.zoom, bottom = top + state.portOffsets.get(node.id).__bounds.y * state.zoom; assert.ok(left >= 39.99 && right <= 1160.01 && top >= 39.99 && bottom <= 860.01); }
    assert.deepEqual(state.graphRef.current, graph);
  });
  await test('pan ignores other pointers and only its initiating pointer can finish it', () => {
    const listeners = new Map(), state = { interaction: { kind: 'pan', pointerId: 7, startClientX: 10, startClientY: 20, startPan: { x: 80, y: 60 } }, window: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name, callback) => { assert.equal(listeners.get(name), callback); listeners.delete(name); } } };
    state.setPan = value => { state.pan = value; }; state.setInteraction = value => { state.ended = value; };
    vm.runInNewContext(ts.transpileModule(`globalThis.cleanup = (${panEffect})();`, { compilerOptions: options }).outputText, state);
    listeners.get('pointermove')({ pointerId: 8, clientX: 999, clientY: 999 }); assert.equal(state.pan, undefined);
    listeners.get('pointerup')({ pointerId: 8 }); assert.equal(state.ended, undefined);
    listeners.get('pointermove')({ pointerId: 7, clientX: 40, clientY: 60 }); close(state.pan.x, 110, 'pan x'); close(state.pan.y, 100, 'pan y');
    listeners.get('pointercancel')({ pointerId: 7 }); assert.equal(state.ended, null); state.cleanup(); assert.equal(listeners.size, 0);
  });
  await test('all workspace labels and count formats exist for zh/en/ja with matching keys', () => {
    const { canvasWorkspaceCopy: copies } = pure('lib/i18n/canvasWorkspace.ts');
    const keys = Object.keys(copies['zh-Hant']).sort();
    for (const locale of ['zh-Hant', 'en', 'ja']) { assert.deepEqual(Object.keys(copies[locale]).sort(), keys); for (const value of Object.values(copies[locale])) assert.ok(typeof value === 'string' && value.trim()); for (const key of ['nodes', 'links']) assert.equal((copies[locale][key].match(/\{n\}/g) || []).length, 1); }
    assert.equal(copies.en.focus, 'Go to node'); assert.equal(copies.ja.focus, 'ノードへ移動'); assert.equal(copies['zh-Hant'].focus, '前往節點');
  });
  await test('run lock blocks saves and draft export remains available without any API', async () => {
    const calls = [], revoked = [], clicked = [], blobs = [], lock = new CanvasRunLock();
    let release; const active = lock.run(() => new Promise(resolve => { release = resolve; }));
    const state = { workflowId: 'private-workflow', nameRef: { current: 'Blue feather' }, graphRef: { current: structuredClone(graph) }, saveState: new CanvasSaveState('revision-1'), runLock: lock, validateGraph: value => value, setSaving() {}, setSaveError() {}, setDirty() {}, fetch: async () => { calls.push('fetch'); throw Error('No API expected'); }, tr: value => value, Blob, URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:local-fixture'; }, revokeObjectURL: url => revoked.push(url) }, document: { createElement: () => { const link = { click() { clicked.push({ href: link.href, download: link.download }); } }; return link; } }, setTimeout: callback => callback() };
    install(state, ['save', 'exportDraft']); await state.save(); state.exportDraft();
    assert.equal(calls.length, 0); assert.deepEqual(clicked, [{ href: 'blob:local-fixture', download: 'canvas-private-workflow-draft.json' }]); assert.deepEqual(revoked, ['blob:local-fixture']);
    assert.deepEqual(JSON.parse(await blobs[0].text()), { name: 'Blue feather', graph, version: 'revision-1' }); assert.equal(lock.busy, true); release(); await active; assert.equal(lock.busy, false);
  });
  console.log(`PASS ${passed} actual workspace handler groups. Network, DOM and provider responses are local fixtures; browser layout is verified separately.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
