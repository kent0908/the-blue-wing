/** Exercise the actual connection layer's installed pointer handlers, without a provider or DOM renderer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let checks = 0;
const check = fn => { fn(); checks++; };
const node = (id, type, x = 0, y = 0) => ({ id, type, x, y, data: {} });
function mount({ pointerType = 'touch', pointerId = 7 } = {}) {
  const effects = [], cleanups = [], updates = [], calls = { completed: [], cancelled: 0, hovered: [] }, frames = new Map();
  const events = () => {
    const listeners = new Map();
    return { listeners, addEventListener(type, fn) { const set = listeners.get(type) || new Set(); set.add(fn); listeners.set(type, set); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      emit(type, event = {}) { for (const fn of [...listeners.get(type) || []]) fn(event); } };
  };
  const windowEvents = events(), documentEvents = { ...events(), visibilityState: 'visible' };
  const previous = Object.fromEntries(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, global[key]]));
  global.window = windowEvents; global.document = documentEvents;
  let frameId = 0;
  global.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  global.cancelAnimationFrame = id => frames.delete(id);
  const hooks = { useRef: value => ({ current: value }), useMemo: fn => fn(), useState: value => [value, next => updates.push(next)], useEffect: fn => effects.push(fn) };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const mod = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'module', 'exports', source)(id => {
      if (id === 'react') return hooks;
      if (id === './director3d') return { defaultDirector3DData: () => ({}) };
      if (id === '../i18n/k') return { k: text => text };
      if (id === './types' || id === '@/lib/canvas/types') return load('lib/canvas/types.ts');
      if (id === '@/lib/canvas/connections') return load('lib/canvas/connections.ts');
      if (id.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => String(key) });
      return require(id);
    }, mod, mod.exports);
    cache.set(file, mod.exports); return mod.exports;
  }
  const graph = { nodes: [node('source', 'image'), node('target', 'image')], edges: [] };
  const offsets = new Map([['target', { prompt: { x: 100, y: 43 }, image: { x: 100, y: 50 } }]]);
  const { default: Connections } = load('components/canvas/CanvasConnections.tsx');
  Connections({ graph, offsets, session: { fromNode: 'source', fromPort: 'out', portType: 'image', startedAt: { x: 0, y: 0 }, pointerId, pointerType, sequence: 1 },
    zoom: 1, selectedEdge: null, toWorld: (x, y) => ({ x, y }), onComplete: (...args) => calls.completed.push(args),
    onCancel: () => calls.cancelled++, onHover: value => calls.hovered.push(value), onSelect() {}, onDelete() {}, edgeLabel: 'Wire' });
  for (const effect of effects) cleanups.push(effect());
  return { calls, updates, window: windowEvents, document: documentEvents, frames,
    flush() { const pending = [...frames]; frames.clear(); for (const [, fn] of pending) fn(); },
    close() {
      for (const cleanup of cleanups.reverse()) if (typeof cleanup === 'function') cleanup();
      for (const key in previous) { if (previous[key] === undefined) delete global[key]; else global[key] = previous[key]; }
    } };
}
const event = (pointerId, clientX = 100, clientY = 43) => ({ pointerId, clientX, clientY, buttons: 0 });
let fixture = mount();
fixture.window.emit('pointermove', event(8)); fixture.flush();
check(() => assert.equal(fixture.updates.length, 0));
fixture.window.emit('pointercancel', event(8));
check(() => assert.equal(fixture.calls.cancelled, 0));
fixture.window.emit('pointermove', event(7)); fixture.flush();
check(() => assert.deepEqual(fixture.updates.at(-1).point, { x: 100, y: 50 }));
check(() => assert.equal(fixture.updates.at(-1).invalid, false));
check(() => assert.equal(fixture.calls.hovered.at(-1), '["target","image"]'));
fixture.window.emit('pointerup', event(8));
check(() => assert.equal(fixture.calls.completed.length, 0));
fixture.window.emit('pointerup', event(7));
check(() => assert.equal(fixture.calls.completed[0][1].portId, 'image'));
fixture.close();
check(() => assert.ok([...fixture.window.listeners.values(), ...fixture.document.listeners.values()].every(set => !set.size)));

for (const [pointerType, success] of [['touch', true], ['mouse', false]]) {
  fixture = mount({ pointerType });
  fixture.window.emit('pointermove', event(7, 65, 50)); fixture.flush(); fixture.window.emit('pointerup', event(7, 65, 50));
  check(() => assert.equal(fixture.calls.completed.length, success ? 1 : 0));
  check(() => assert.equal(fixture.calls.cancelled, success ? 0 : 1));
  fixture.close();
}
fixture = mount(); fixture.window.emit('pointerup', event(7, 0, 0));
check(() => assert.equal(fixture.calls.cancelled + fixture.calls.completed.length, 0)); // A tap leaves the source armed.
fixture.window.emit('pointercancel', event(7));
check(() => assert.equal(fixture.calls.cancelled, 1)); fixture.close();
fixture = mount(); fixture.window.emit('blur');
check(() => assert.equal(fixture.calls.cancelled, 1)); fixture.close();
fixture = mount(); fixture.document.emit('visibilitychange');
check(() => assert.equal(fixture.calls.cancelled, 0));
fixture.document.visibilityState = 'hidden'; fixture.document.emit('visibilitychange');
check(() => assert.equal(fixture.calls.cancelled, 1)); fixture.close();
fixture = mount(); let prevented = false;
fixture.window.emit('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
check(() => assert.ok(prevented && fixture.calls.cancelled === 1)); fixture.close();
fixture = mount(); fixture.window.emit('pointermove', event(7));
check(() => assert.equal(fixture.frames.size, 1)); fixture.close();
check(() => assert.equal(fixture.frames.size, 0));
console.log(`PASS ${checks} actual connection-handler checks: precise compatible snapping, touch landing radius, pointer isolation, armed taps, blur/visibility cancellation and complete listener cleanup.`);
