/** Run the actual native onWheel handler extracted from CanvasEditor's TypeScript AST.
 * Only its DOM inputs are supplied; the production handler is not copied into this test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('components/canvas/CanvasEditor.tsx', 'utf8');
const ast = ts.createSourceFile('CanvasEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'onWheel') declaration = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(declaration, 'The real CanvasEditor native wheel handler must exist.');
const javascript = ts.transpileModule(`const handler = ${declaration.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
class FakeElement {
  constructor(tagName = 'DIV', parentElement = null, props = {}) { Object.assign(this, { tagName, parentElement, style: { overflowY: 'visible' }, scrollHeight: 100, clientHeight: 100 }, props); }
  closest() {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName) || this.contentEditable === true) return this;
    return this.parentElement?.closest() ?? null;
  }
}
function fixture(scale = 1) {
  const stage = new FakeElement(); stage.getBoundingClientRect = () => ({ left: 30, top: 40 });
  const zoom = { current: scale }, pan = { current: { x: 80, y: 60 } }, values = { zoom: [], pan: [], styleReads: 0 };
  const handler = new Function('el', 'panRef', 'zoomRef', 'setZoom', 'setPan', 'Element', 'getComputedStyle', `${javascript}; return handler;`)(
    stage, pan, zoom, next => values.zoom.push(next), next => values.pan.push(next), FakeElement,
    element => { values.styleReads++; return element.style; });
  const fire = (target = stage, deltaY = -120, ctrlKey = false) => {
    const event = { target, deltaY, ctrlKey, clientX: 430, clientY: 340, prevented: false, preventDefault() { this.prevented = true; } };
    handler(event); return event;
  };
  return { stage, zoom, pan, values, fire };
}
let checks = 0;
const check = fn => { fn(); checks++; };
let f = fixture(), before = { x: (400 - f.pan.current.x) / f.zoom.current, y: (300 - f.pan.current.y) / f.zoom.current };
check(() => assert.equal(f.fire().prevented, true));
check(() => assert.equal(f.zoom.current, 1.1));
check(() => assert.ok(Math.abs((400 - f.pan.current.x) / f.zoom.current - before.x) < 1e-9 && Math.abs((300 - f.pan.current.y) / f.zoom.current - before.y) < 1e-9));
f.fire(); // No intervening React render: refs must already carry the preceding event.
check(() => assert.ok(Math.abs(f.zoom.current - 1.21) < 1e-9));
for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
  f = fixture(); const control = new FakeElement(tag, f.stage);
  check(() => assert.equal(f.fire(control).prevented, false));
  check(() => assert.equal(f.values.zoom.length, 0));
}
f = fixture(); const editable = new FakeElement('DIV', f.stage, { contentEditable: true }), nestedText = new FakeElement('SPAN', editable);
check(() => assert.equal(f.fire(nestedText).prevented, false));
f = fixture(); const select = new FakeElement('SELECT', f.stage), option = new FakeElement('OPTION', select);
check(() => assert.equal(f.fire(option).prevented, false));
for (const overflowY of ['auto', 'scroll']) {
  f = fixture(); const output = new FakeElement('PRE', f.stage, { style: { overflowY }, scrollHeight: 500 }), code = new FakeElement('CODE', output);
  check(() => assert.equal(f.fire(code).prevented, false));
  check(() => assert.equal(f.values.zoom.length, 0));
}
f = fixture(); const shortOutput = new FakeElement('DIV', f.stage, { style: { overflowY: 'auto' } });
check(() => assert.equal(f.fire(shortOutput).prevented, true));
f = fixture(); const clipped = new FakeElement('DIV', f.stage, { style: { overflowY: 'hidden' }, scrollHeight: 500 });
check(() => assert.equal(f.fire(clipped).prevented, true));
f = fixture(); f.stage.parentElement = new FakeElement('DIV', null, { style: { overflowY: 'auto' }, scrollHeight: 500 });
check(() => assert.equal(f.fire().prevented, true)); // Never mistake the app's outer scroller for a node scroller.
f = fixture();
check(() => assert.equal(f.fire(f.stage, 0).prevented, false));
check(() => assert.equal(f.values.zoom.length, 0));
f = fixture();
check(() => assert.equal(f.fire(new FakeElement('TEXTAREA', f.stage), -120, true).prevented, true));
check(() => assert.equal(f.zoom.current, 1.1));
f = fixture(); const scrolling = new FakeElement('DIV', f.stage, { style: { overflowY: 'auto' }, scrollHeight: 500 });
check(() => assert.equal(f.fire(scrolling, -120, true).prevented, true));
f = fixture(2.49); f.fire(); check(() => assert.equal(f.zoom.current, 2.5));
f = fixture(2.5); f.fire(f.stage, 120); check(() => assert.equal(f.zoom.current, 2.25));
f = fixture(.15); f.fire(f.stage, 120); check(() => assert.equal(f.zoom.current, .15));
f = fixture(.15); f.fire(); check(() => assert.ok(Math.abs(f.zoom.current - .165) < 1e-9));
console.log(`PASS ${checks} actual native wheel-handler checks: prompt/form scrolling, nested output scrolling, horizontal gestures, pinch-to-zoom, exact cursor anchoring, sequential events and consistent zoom limits.`);
