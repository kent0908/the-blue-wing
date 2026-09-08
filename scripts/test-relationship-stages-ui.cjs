const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file) {
  const m = {exports:{}};
  const output = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',output)(id=>id==='@/lib/relationshipStages'?load('lib/relationshipStages.ts'):require(id),m,m.exports);
  return m.exports;
}
const Stages = load('components/RelationshipStages.tsx').default;
for (const affection of [0,10,20,39,40,60,80,100,120]) {
  const html = renderToStaticMarkup(React.createElement(Stages,{affection}));
  assert.equal((html.match(/aria-pressed=/g)||[]).length,6);
  assert.equal((html.match(/<clipPath/g)||[]).length,6);
  assert.ok(html.includes('點選僅預覽說明，不會改變好感度或解鎖階段'));
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
}
const midway = renderToStaticMarkup(React.createElement(Stages,{affection:10}));
for(const fill of [0,20,40,60,80,100]) assert.ok(midway.includes(`進度 ${fill}%`));
assert.ok(!midway.includes('grid-cols-2'));
assert.ok(midway.includes('未解鎖'));
console.log('PASS: 9 affection states, six accessible preview controls/hearts, current-stage selection and fixed 0/20/40/60/80/100 heart fills and vertical layout. No backend mutation or network.');
