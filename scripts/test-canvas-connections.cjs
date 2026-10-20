const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id === './director3d') return { defaultDirector3DData: () => ({ characters: [], ground: {}, background: {} }) };
    if (id === '../i18n/k') return { k: text => text };
    if (id === './types' || id === '@/lib/canvas/types') return load('lib/canvas/types.ts');
    if (id === '@/lib/canvas/connections') return load('lib/canvas/connections.ts');
    if (id.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => String(key) });
    return require(id);
  }, mod, mod.exports);
  cache.set(file, mod.exports); return mod.exports;
}
const { connectionRejection: reject, connectCanvasPorts: connect, nearestCanvasPort: nearest, canvasConnectionPath: path, canvasPortKey: key } = load('lib/canvas/connections.ts');
const { default: Connections, measuredPortPosition: position } = load('components/canvas/CanvasConnections.tsx');
const { canvasConnectionsCopy: copy } = load('lib/i18n/canvasConnections.ts');
const node = (id, type, x = 0, y = 0) => ({ id, type, x, y, data: {} });
const nodes = [node('text', 'text'), node('imageA', 'image', 300, 10), node('imageB', 'image', 650, 100), node('imageC', 'image', 950, 0), node('video', 'video')];
const graph = { nodes, edges: [] };
const source = { fromNode: 'imageA', fromPort: 'out', portType: 'image' };
const target = { nodeId: 'imageB', portId: 'image', type: 'image' };
let checks = 0;
function check(fn) { fn(); checks++; }
check(() => assert.equal(reject(graph, source, target), null));
check(() => assert.equal(reject(graph, source, { ...target, nodeId: 'imageA' }), 'self'));
check(() => assert.equal(reject(graph, source, { ...target, nodeId: 'missing' }), 'missing'));
check(() => assert.equal(reject(graph, { ...source, fromNode: 'missing' }, target), 'missing'));
check(() => assert.equal(reject(graph, { ...source, fromPort: 'bad' }, target), 'type'));
check(() => assert.equal(reject(graph, source, { ...target, portId: 'missing' }), 'type'));
check(() => assert.equal(reject(graph, source, { ...target, portId: 'prompt', type: 'text' }), 'type'));
check(() => assert.equal(reject(graph, source, { ...target, type: 'text' }), 'type'));
const connected = connect(graph, source, target, 'ab');
check(() => assert.equal(connected.edges.length, 1));
check(() => assert.equal(graph.edges.length, 0));
check(() => assert.equal(connected.edges[0].fromNode, 'imageA'));
check(() => assert.equal(reject(connected, { ...source, fromNode: 'imageB' }, { ...target, nodeId: 'imageA' }), 'cycle'));
check(() => assert.strictEqual(connect(connected, { ...source, fromNode: 'imageB' }, { ...target, nodeId: 'imageA' }, 'ba'), connected));
const chain = connect(connected, { ...source, fromNode: 'imageB' }, { ...target, nodeId: 'imageC' }, 'bc');
check(() => assert.equal(reject(chain, { ...source, fromNode: 'imageC' }, { ...target, nodeId: 'imageA' }), 'cycle'));
const replaced = connect(chain, { ...source, fromNode: 'imageC' }, target, 'cb');
check(() => assert.strictEqual(replaced, chain)); // B → C → B remains a genuine cycle.
const replacement = connect(connected, { ...source, fromNode: 'imageC' }, target, 'cb');
check(() => assert.deepEqual(replacement.edges.map(edge => edge.id), ['cb']));
const rewired = connect(chain, { ...source, reconnectEdgeId: 'ab' }, { ...target, nodeId: 'imageC' }, 'ac');
check(() => assert.deepEqual(rewired.edges.map(edge => edge.id), ['ac'])); // Both previous target and original wire are removed atomically.
check(() => assert.deepEqual(chain.edges.map(edge => edge.id), ['ab', 'bc']));
const ports = [{ id: 'near', x: 100, y: 50 }, { id: 'far', x: 200, y: 50 }];
for (const zoom of [.15, .3, 1, 2.5]) {
  check(() => assert.equal(nearest(ports, { x: 100 - 27 / zoom, y: 50 }, zoom)?.id, 'near'));
  check(() => assert.equal(nearest([ports[0]], { x: 100 - 29 / zoom, y: 50 }, zoom), null));
}
check(() => assert.equal(nearest(ports, { x: 100, y: 50 }, 0), null));
check(() => assert.equal(nearest(ports, { x: 100, y: 50 }, NaN), null));
check(() => assert.notEqual(key('a,b', 'c'), key('a', 'b,c')));
check(() => assert.equal(path({ x: 10, y: 20 }, { x: 100, y: 50 }), 'M 10 20 C 60 20, 50 50, 100 50'));
check(() => assert.deepEqual(position(nodes[1], 'out', { out: { x: 240.5, y: 20.5 } }), { x: 540.5, y: 30.5 }));
check(() => assert.deepEqual(position({ ...nodes[1], x: 455, width: 420 }, 'out', { out: { x: 420.5, y: 20.5 } }), { x: 875.5, y: 30.5 }));
const offsets = new Map([['imageA', { out: { x: 240.5, y: 20.5 } }], ['imageB', { image: { x: .5, y: 79.5 } }]]);
for (const locale of ['zh-Hant', 'en', 'ja']) {
  check(() => assert.ok(copy[locale].help && copy[locale].cycle && copy[locale].run.includes('{c}')));
  const html = renderToStaticMarkup(React.createElement(Connections, { graph: connected, offsets, session: null, zoom: 1, selectedEdge: 'ab', toWorld: (x, y) => ({ x, y }), onComplete() {}, onCancel() {}, onHover() {}, onSelect() {}, onDelete() {}, edgeLabel: copy[locale].edge }));
  check(() => assert.ok(html.includes('M 540.5 30.5 C')));
  check(() => assert.ok(html.includes('650.5 179.5')));
  check(() => assert.ok(html.includes('stroke-width="16"') && html.includes('role="button"') && html.includes('tabindex="0"')));
  check(() => assert.equal((html.match(/<animateMotion/g) ?? []).length, 3));
}
const css = fs.readFileSync('components/canvas/connections.module.css', 'utf8');
check(() => assert.ok(css.includes('prefers-reduced-motion: reduce') && css.includes('.movingDot { display: none; }')));
check(() => assert.ok(css.includes('width: 32px; height: 32px;')));
console.log(`PASS ${checks} canvas connection checks: cycles, replacement, safe reconnect, zoom-independent snapping, real offset geometry, accessible SVG and three-language copy.`);
