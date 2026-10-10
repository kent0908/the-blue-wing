const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual confirmation handler with stale React render values.
// No browser, provider, database, or points are used.
const source = fs.readFileSync('components/Composer.tsx', 'utf8');
const ast = ts.createSourceFile('Composer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'submit' && ts.isArrowFunction(node.initializer)) handler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler, 'Actual Composer submit handler exists');
const calls = [];
let uuids = 0;
const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
const noOp = () => {};
const context = {
  canSubmit: true, draftEnabled: true,
  draftConfirm: { current: dialog }, draftSubmission: { current: null },
  crypto: { randomUUID: () => `confirmed-${++uuids}` },
  operation: 'text-to-video', canUseRefs: false, isFramePair: false, refs: [],
  prompt: 'One blue feather through a paper city', resolvedModel: 'SIRAYA-Seedance-2.5',
  effectiveSettings: { seconds: 24, resolution: '480p', aspect: '16:9', generateAudio: true },
  activeImageModel: null, moderation: 'auto', watermarkSupported: true, watermark: false,
  videoRefSupported: false, videoRef: null, providerIds: [], credits: 1008, mode: 'video',
  onSubmit: payload => calls.push(payload),
  setLayerConfirm: noOp, setProviderSelection: noOp, setPrompt: noOp, setManualExpand: noOp,
  setRefs: noOp, setFrameReset: noOp, setRefPicker: noOp, setMention: noOp, setVideoRef: noOp,
};
const code = ts.transpileModule(`globalThis.submit = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, context);
context.submit(false);
context.submit(false);
assert.equal(calls.length, 0, 'Opening or reopening confirmation cannot submit');
assert.equal(uuids, 1, 'An open confirmation retains its UUID');
context.submit(true);
context.submit(true);
assert.equal(calls.length, 1, 'Synchronous duplicate confirmation submits once');
assert.equal(calls[0].clientRequestId, 'confirmed-1');
assert.equal(calls[0].expectedCredits, 1008);
assert.equal(calls[0].draft, true);
assert.equal(calls[0].settings.resolution, '480p');
assert.equal(calls[0].settings.generateAudio, true);
context.submit(false);
dialog.close();
context.submit(true);
assert.equal(calls.length, 1, 'Cancelled or closed confirmation cannot submit');
context.submit(false);
context.submit(true);
assert.equal(calls.length, 2, 'A new explicit confirmation can create a new job');
assert.notEqual(calls[1].clientRequestId, calls[0].clientRequestId);
console.log('PASS real Composer handler: open/cancel zero calls, stale double confirmation one UUID/one job, explicit new confirmation separate job; quote/audio preserved.');
