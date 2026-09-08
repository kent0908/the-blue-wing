const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in deps)return deps[id];throw Error(id)},m,m.exports);return m.exports;}
const labels=load('lib/modelLabel.ts');
const display=load('lib/modelDisplay.ts',{'./modelLabel':labels,'./db':{sql:()=>{throw Error('no database')}}});
for(const input of ['SIRAYA-Seedance-2.0','NSFW-SIRAYA-Dola-Seedream-5.0-pro','SIRAYA SIRAYA / Seedance','my Siraya model','siraya','[SIRAYA] Seedance'])assert.ok(!/siraya/i.test(labels.modelLabel(input)));
assert.equal(labels.modelLabel('NSFW-SIRAYA-Dola-Seedream-5.0-pro'),'NSFW-Seedream-5.0-pro');
assert.equal(labels.modelLabel('veo-3.1-generate-001'),'veo-3.1-generate-001');
const id='SIRAYA-Seedance-2.0';const overrides=new Map([[id,{displayName:'SIRAYA Custom Name',sortOrder:5}]]);
assert.equal(display.resolveModelDisplay(id,overrides).displayName,'Custom Name');
assert.equal(display.resolveModelDisplay(id,overrides).sortOrder,5);
assert.ok(overrides.has(id));
for(const file of ['components/Composer.tsx','components/Sidebar.tsx','components/CharacterScenes.tsx','components/JobQueue.tsx','components/canvas/CanvasEditor.tsx','app/studio/page.tsx','app/admin/models/page.tsx','app/admin/rates/page.tsx','app/admin/home/page.tsx'])assert.ok(fs.readFileSync(file,'utf8').includes('modelLabel('),file);
assert.ok(!fs.readFileSync('app/layout.tsx','utf8').includes('SIRAYA'));
console.log('PASS: display aliases, overrides, NSFW distinction, stable real IDs, model render surfaces and metadata. No network or database writes.');
