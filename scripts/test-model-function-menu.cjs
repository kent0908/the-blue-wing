const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',output)(id=>{
 if(id.endsWith('.module.css'))return new Proxy({},{get:(_,k)=>String(k)});
 if(id==='./ModelLogo')return {__esModule:true,default:()=>null};
 if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
 if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));
 return require(id);
},m,m.exports);cache.set(file,m.exports);return m.exports;}
const {modelFunctionSelection:select}=load('lib/modelFunctionSelection.ts');
let checks=0;function test(name,fn){fn();checks++;console.log('PASS '+name);}
const queryOf=result=>new URL(result.href,'https://test.invalid').searchParams;
test('model and function navigate atomically while preserving draft query',()=>{const r=select('mode=image&q=keep%20my%20draft&operation=universal-reference','video','SIRAYA-Seedance-2.0-mini','first-last-frame');const q=queryOf(r);assert.equal(q.get('mode'),'video');assert.equal(q.get('model'),'SIRAYA-Seedance-2.0-mini');assert.equal(q.get('operation'),'first-last-frame');assert.equal(q.get('q'),'keep my draft');});
test('same-model function switch replaces old function',()=>{const q=queryOf(select('model=SIRAYA-Seedance-2.0-mini&operation=first-last-frame','video','SIRAYA-Seedance-2.0-mini','subject-reference'));assert.equal(q.get('operation'),'subject-reference');});
test('no-function model clears stale operation',()=>{const r=select('operation=first-last-frame','video','happyhorse-1.1-i2v');assert.equal(r.operation,'');assert.equal(queryOf(r).has('operation'),false);});
test('text model also clears stale video function',()=>assert.equal(queryOf(select('operation=first-last-frame','text','text-model')).has('operation'),false));
test('model without explicit function selects supported default',()=>assert.equal(select('operation=first-last-frame','video','SIRAYA-Seedance-2.0-mini').operation,'freestyle'));
test('image selection replaces incompatible video function',()=>assert.equal(select('operation=first-last-frame','image','Seedream-4.0').operation,'universal-reference'));
test('disabled function cannot navigate',()=>assert.throws(()=>select('','video','SIRAYA-Seedance-2.0-mini','video-extend'),/尚未開放/));
test('unknown function cannot navigate',()=>assert.throws(()=>select('','video','SIRAYA-Seedance-2.0-mini','injected'),/尚未開放/));
test('NSFW model excluded at selection boundary',()=>assert.throws(()=>select('','video','NSFW-Seedance-2.0-mini'),/一般生成模型/));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const Menu=load('components/ModelFunctionMenu.tsx').default;
test('real menu exposes enabled and disabled catalog functions',()=>{const html=renderToStaticMarkup(React.createElement(Menu,{models:[{id:'SIRAYA-Seedance-2.0-mini',displayName:'Seedance mini'}],mode:'video',selectedModel:'SIRAYA-Seedance-2.0-mini',selectedOperation:'first-last-frame',loading:false,error:null,onSelect(){}}));assert.ok(html.includes('首尾幀編輯'));assert.ok(html.includes('主體參考'));assert.match(html,/<button[^>]*disabled=""[^>]*>影片編輯/);assert.ok(html.includes('首尾幀編輯 ✓'));});
test('Composer no longer places function panel above prompt',()=>{const source=fs.readFileSync('components/Composer.tsx','utf8');assert.ok(source.indexOf('<GenerationModePanel')>source.indexOf('<ModelFunctionMenu'));assert.ok(source.includes('modelFunctionSelection(modeParams.toString()'));assert.ok(source.includes('setFrameReset(value => value + 1)'));});
test('compact material picker preserves registration path without function select',()=>{const source=fs.readFileSync('components/GenerationModePanel.tsx','utf8');assert.ok(source.includes('href="/assets"'));assert.ok(!source.includes('<select'));assert.ok(!source.includes('onOperation'));});
console.log(`Model function selection: ${checks} passed; no network or generation.`);
