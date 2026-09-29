const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','module','exports',js)(p=>p.startsWith('.')?load(path.resolve(path.dirname(file),p+'.ts')):p.startsWith('@/')?load(path.resolve(p.slice(2)+'.ts')):require(p),m,m.exports);return m.exports;}
const {OFFICIAL_CANVAS_TEMPLATES:templates}=load('lib/canvas/officialTemplates.ts');const {validateGraph}=load('lib/canvas/validation.ts');const {shareableGraph}=load('lib/canvas/sharing.ts');
assert.equal(templates.length,13);assert.equal(new Set(templates.map(t=>t.id)).size,templates.length);for(const t of templates){validateGraph(t.graph);const shared=shareableGraph(t.graph);assert.equal(shared.nodes.length,t.graph.nodes.length);for(const n of t.graph.nodes){if(n.type==='text')assert.ok(n.data.text.length>100);if(n.type==='image')assert.equal(n.data.model,'gpt-image-2.5-sunburst');}assert.ok(fs.existsSync('public/official-characters/'+t.character+'.jpg'));}
const dirty=structuredClone(templates[0].graph);dirty.nodes[0].data.items=[{assetId:123,src:'/private',name:'secret'}];dirty.nodes[0].output={kind:'image',items:[{url:'/private'}]};const shared=shareableGraph(dirty);assert.deepEqual(shared.nodes[0].data.items,[]);assert.equal(shared.nodes[0].output,undefined);assert.equal(dirty.nodes[0].data.items.length,1);
assert.throws(()=>shareableGraph({nodes:[],edges:[{id:'x',fromNode:'missing',fromPort:'out',toNode:'x',toPort:'image'}]}));
console.log('PASS: 13 templates; graph validation; reference assets; prompts; private-data removal; source preservation; malformed graph rejection');
if(process.argv.includes("--fixture"))fs.writeFileSync(process.env.TEMP+"/canvas-template-fixture.json",JSON.stringify({templates:templates.map(load("lib/canvas/officialTemplates.ts").builtinCanvasSummary)}));
const legacy=structuredClone(templates[0].graph);legacy.nodes[0].data.items=[{assetId:'123',src:'/api/assets/123/raw',name:'reference'}];legacy.nodes[0].output={kind:'image',items:[{assetId:'123',url:'/api/assets/123/raw'}]};const normalized=validateGraph(legacy);assert.equal(normalized.nodes[0].data.items[0].assetId,123);assert.equal(normalized.nodes[0].output.items[0].assetId,123);assert.equal(legacy.nodes[0].data.items[0].assetId,'123');for(const bad of ['0','-1','1.5','123abc','9007199254740993']){legacy.nodes[0].data.items[0].assetId=bad;assert.throws(()=>validateGraph(legacy));}console.log('PASS: bigint-string asset IDs normalize; invalid IDs rejected; source draft unchanged');

// All advertised media must exist; diagram covers must not imply generated video previews.
const {builtinCanvasSummary}=load('lib/canvas/officialTemplates.ts');
for(const t of templates){const summary=builtinCanvasSummary(t);assert.ok(fs.existsSync('public'+summary.cover));if(summary.previewVideo)assert.ok(fs.existsSync('public'+summary.previewVideo));}
const added=templates.filter(t=>t.id<=-108);
assert.equal(added.length,6);
for(const t of added){
 assert.equal(builtinCanvasSummary(t).previewVideo,undefined);
 assert.deepEqual(shareableGraph(t.graph),t.graph);
 assert.ok(t.graph.nodes.find(n=>n.id==='guide').data.text.includes('單點執行包含上游'));
 assert.ok(!t.graph.edges.some(e=>e.fromNode==='guide'),'production notes must not become model prompt');
 for(const n of t.graph.nodes.filter(n=>['image','video'].includes(n.type))){
  assert.equal(t.graph.edges.filter(e=>e.toNode===n.id&&e.toPort==='prompt').length,1);
  if(n.type==='video'){
   const edge=t.graph.edges.find(e=>e.toNode===n.id&&e.toPort==='image');
   assert.equal(t.graph.nodes.find(x=>x.id===edge.fromNode).type,'image','movie starts from scene, never character sheet');
   assert.equal(n.data.seconds,5);assert.equal(n.data.resolution,'720p');
  }
 }
}
const pack=templates.find(t=>t.id===-112).graph.nodes.find(n=>n.id==='reference');
assert.deepEqual(pack.data.items,[]);assert.equal(pack.data.officialCharacter,undefined,'missing three-role references must not silently become a character sheet');
for(const id of [-108,-110,-111])assert.ok(!templates.find(t=>t.id===id).graph.nodes.some(n=>n.type==='loadImage'),'environment and prop templates need no character input');
console.log('PASS: six production templates; acyclic shareable graphs; reference roles; scene first frames; real preview assets; cost guidance');
