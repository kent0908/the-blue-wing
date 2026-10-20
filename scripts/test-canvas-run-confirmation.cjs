const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let locale = 'zh-Hant';
function compile(file, resolver) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(resolver, mod, mod.exports);
  return mod.exports;
}
const { canvasConnectionsCopy: copy } = compile('lib/i18n/canvasConnections.ts', require);
const { default: Confirmation } = compile('components/canvas/CanvasRunConfirmation.tsx', id => {
  if (id === '@/lib/i18n/client') return { useLocale: () => locale };
  if (id === '@/lib/i18n/canvasConnections') return { canvasConnectionsCopy: copy };
  if (id.endsWith('.module.css')) return {};
  return require(id);
});
let checks = 0;
for (locale of ['zh-Hant', 'en', 'ja']) {
  const message = copy[locale].run.replace('{n}', '4').replace('{c}', '99');
  const html = renderToStaticMarkup(React.createElement(Confirmation, { message, onDecision() {} }));
  assert.ok(html.startsWith('<dialog')); checks++;
  assert.ok(html.includes(copy[locale].runTitle)); checks++;
  assert.ok(html.includes(copy[locale].runCancel) && html.includes(copy[locale].runConfirm)); checks++;
  assert.ok(html.includes(message)); checks++;
  const heading = html.match(/aria-labelledby="([^"]+)"/)[1];
  const description = html.match(/aria-describedby="([^"]+)"/)[1];
  assert.ok(html.includes(`<h2 id="${heading}">`)); checks++;
  assert.ok(html.includes(`<p id="${description}">`)); checks++;
  assert.equal((html.match(/<button/g) ?? []).length, 2); checks++;
}
const editor = fs.readFileSync('components/canvas/CanvasEditor.tsx', 'utf8');
assert.ok(!editor.includes('confirm(connectionCopy.run')); checks++;
assert.ok(editor.includes('await requestRunConfirmation(')); checks++;
assert.ok(editor.includes('runConfirmationResolver.current?.(false)')); checks++;
assert.ok(editor.includes('!runtime && runConfirmation !== null')); checks++;
const styles = fs.readFileSync('components/canvas/runConfirmation.module.css', 'utf8');
assert.ok(styles.includes('calc(100vw - 32px)') && styles.includes('max-height: calc(100dvh - 40px)')); checks++;
console.log(`PASS ${checks} confirmation checks: real HTML dialog, labelled title/description, three languages, guarded consumer renderer and cancellable promise wiring.`);
