/* Actual consumer Composer reference controls; pure local fixtures, no uploads, requests or credits. */
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
function load(name, dependencies={}) {
  const result={exports:{}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions}).outputText)(id=>{assert.ok(id in dependencies,`Unexpected dependency ${id}`);return dependencies[id]},result,result.exports);
  return result.exports;
}
const seedance=load('businessSeedance'),kling=load('klingVideo'),minimax=load('minimaxVideo');
const video=load('videoModels',{'./klingVideo':kling,'./minimaxVideo':minimax});
const source=fs.readFileSync('components/Composer.tsx','utf8');
const ast=ts.createSourceFile('Composer.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations={};
function visit(node){if(ts.isVariableDeclaration(node)&&['refCap','addRef','toggleRef','modeRefsValid'].includes(node.name.getText(ast)))declarations[node.name.getText(ast)]=node.initializer.getText(ast);ts.forEachChild(node,visit)}
visit(ast);
for(const name of ['refCap','addRef','toggleRef','modeRefsValid'])assert.ok(declarations[name],`Actual Composer ${name} found`);
function context(model,mode='video',operation='freestyle') {
  const state={resolvedModel:model,mode,operation,refs:[],providerIds:[],MAX_REF_IMAGES:4,...seedance,...video,frameData:{slots:[],uploading:[false,false]},orderedFrameIds:()=>null};
  state.setRefs=updater=>{state.refs=updater(state.refs)};
  state.fetch=()=>{throw Error('Reference selection cannot make a network call')};
  vm.runInNewContext(ts.transpileModule(`globalThis.refCap=${declarations.refCap};globalThis.addRef=${declarations.addRef};globalThis.toggleRef=${declarations.toggleRef};globalThis.refsValid=()=>(${declarations.modeRefsValid});`,{compilerOptions}).outputText,state);
  return state;
}
const cases=[
 ['SIRAYA-Seedance-2.0',9],['SIRAYA-Seedance-2.0-fast',9],['SIRAYA-Seedance-2.0-mini',9],['NSFW-SIRAYA-Seedance-2.0',9],
 ['SIRAYA-Seedance-2.5',30],['NSFW-SIRAYA-Seedance-2.5',30],['minimax-h3',5],['minimax-h3-max',2],
 ['kling-3.0-omni',4],['kling-3.0',0],['wan3.0-video',9],['ByteDance-Seedance-1.5-pro',0],['veo-3.1-generate-001',0],
];
for(const [model,cap]of cases){
 const state=context(model);assert.equal(state.refCap,cap,`${model} uses the actual image picker ceiling`);
 for(let id=1;id<=cap+2;id++)state.addRef({id,name:`Image ${id}`});
 assert.equal(state.refs.length,cap,`${model} cannot select more images than its provider accepts`);
 assert.equal(state.refsValid(),true,'A within-limit selection keeps existing mode validity');
 if(cap){state.addRef(state.refs[0]);assert.equal(state.refs.length,cap,'Duplicate selection is a no-op');state.toggleRef(state.refs[0]);assert.equal(state.refs.length,cap-1);state.toggleRef({id:cap+5,name:'Replacement'});assert.equal(state.refs.length,cap);state.toggleRef({id:cap+6,name:'Overflow'});assert.equal(state.refs.length,cap);}
 state.refs=Array.from({length:cap+1},(_,i)=>({id:i+1}));assert.equal(state.refsValid(),!seedance.getSeedanceCapability(model),'Only modern Seedance stale selections gain the additional per-image submit guard; other models retain their prior validity behavior');
}
for(const [operation,cap]of [['image-to-video',1],['first-last-frame',2],['layer-separation',1]])assert.equal(context('SIRAYA-Seedance-2.5','video',operation).refCap,cap,'Explicit frame modes keep their exact allocation');
assert.equal(context('Dola-Seedream-5.0-pro','image').refCap,4,'Image generation retains its existing four-image picker');
assert.equal(video.maxRefsForVideoModel('SIRAYA-Seedance-2.0'),15,'Consumer API still allows fifteen mixed materials');
assert.equal(video.maxRefsForVideoModel('SIRAYA-Seedance-2.5'),50,'Consumer API still allows fifty mixed materials');
console.log(`PASS consumer Composer references: ${cases.length} model ceilings, actual add/toggle/stale-selection controls, exact frame allocations and unchanged mixed-material API limits; zero network or paid calls.`);
