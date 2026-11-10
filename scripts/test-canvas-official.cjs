const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','module','exports',js)(p=>p.startsWith('.')?load(path.resolve(path.dirname(file),p+'.ts')):p.startsWith('@/')?load(path.resolve(p.slice(2)+'.ts')):require(p),m,m.exports);return m.exports;}
const {OFFICIAL_CANVAS_TEMPLATES:templates}=load('lib/canvas/officialTemplates.ts');const {validateGraph}=load('lib/canvas/validation.ts');const {shareableGraph}=load('lib/canvas/sharing.ts');
assert.equal(templates.length,14);assert.equal(new Set(templates.map(t=>t.id)).size,templates.length);for(const t of templates){validateGraph(t.graph);const shared=shareableGraph(t.graph);assert.equal(shared.nodes.length,t.graph.nodes.length);for(const n of t.graph.nodes){if(n.type==='text')assert.ok(n.data.text.length>100);if(n.type==='image')assert.equal(n.data.model,'gpt-image-2.5-sunburst');}if(t.character)assert.ok(fs.existsSync('public/official-characters/'+t.character+'.jpg'));}
const dirty=structuredClone(templates[0].graph);dirty.nodes[0].data.items=[{assetId:123,src:'/private',name:'secret'}];dirty.nodes[0].output={kind:'image',items:[{url:'/private'}]};const shared=shareableGraph(dirty);assert.deepEqual(shared.nodes[0].data.items,[]);assert.equal(shared.nodes[0].output,undefined);assert.equal(dirty.nodes[0].data.items.length,1);
assert.throws(()=>shareableGraph({nodes:[],edges:[{id:'x',fromNode:'missing',fromPort:'out',toNode:'x',toPort:'image'}]}));
console.log('PASS: 14 templates; graph validation; reference assets; prompts; private-data removal; source preservation; malformed graph rejection');
if(process.argv.includes("--fixture"))fs.writeFileSync(process.env.TEMP+"/canvas-template-fixture.json",JSON.stringify({templates:templates.map(load("lib/canvas/officialTemplates.ts").builtinCanvasSummary)}));
const legacy=structuredClone(templates[0].graph);legacy.nodes[0].data.items=[{assetId:'123',src:'/api/assets/123/raw',name:'reference'}];legacy.nodes[0].output={kind:'image',items:[{assetId:'123',url:'/api/assets/123/raw'}]};const normalized=validateGraph(legacy);assert.equal(normalized.nodes[0].data.items[0].assetId,123);assert.equal(normalized.nodes[0].output.items[0].assetId,123);assert.equal(legacy.nodes[0].data.items[0].assetId,'123');for(const bad of ['0','-1','1.5','123abc','9007199254740993']){legacy.nodes[0].data.items[0].assetId=bad;assert.throws(()=>validateGraph(legacy));}console.log('PASS: bigint-string asset IDs normalize; invalid IDs rejected; source draft unchanged');

// All advertised media must exist; diagram covers must not imply generated video previews.
const {builtinCanvasSummary}=load('lib/canvas/officialTemplates.ts');
const {publishedCoverPath}=load('lib/canvas/publishedCovers.ts');
for(const t of templates){const summary=builtinCanvasSummary(t);if(summary.cover?.startsWith('/api/'))assert.ok(publishedCoverPath(String(t.id)));else if(summary.cover)assert.ok(fs.existsSync('public'+summary.cover));else assert.equal(summary.previewImages?.length,3);if(summary.previewVideo)assert.ok(fs.existsSync('public'+summary.previewVideo));}
for(const id of ['1','-112','-113','__proto__','constructor','../-108','-108?path=secret'])assert.equal(publishedCoverPath(id),undefined);

const added=templates.filter(t=>t.id<=-108 && t.id>=-113);
assert.equal(added.length,6);
for(const t of added){
 assert.equal(builtinCanvasSummary(t).previewVideo,t.id === -113 ? "/official-canvas-previews/113-v2.mp4" : undefined);
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

const { builtinCanvasTemplate, officialCanvasTemplates } = load('lib/canvas/officialTemplates.ts');
const { SHORT_DRAMA_TEMPLATE_ID } = load('lib/canvas/shortDramaTemplate.ts');
const { sizeOptionsFor } = load('lib/imageModels.ts');
const { videoConstraintFor } = load('lib/videoModels.ts');
const { executeGraph, runNode, topoOrder } = load('lib/canvas/engine.ts');
const { orderedShots } = load('lib/canvas/storyboard.ts');
const names = ['最後一班渡船', 'The Last Ferry', '最後の渡し船'];
for (const [index, locale] of ['zh-Hant', 'en', 'ja'].entries()) {
 const featured = officialCanvasTemplates(locale)[0];
 assert.equal(featured.id, SHORT_DRAMA_TEMPLATE_ID);
 const template = builtinCanvasTemplate(SHORT_DRAMA_TEMPLATE_ID, locale);
 assert.ok(template.name.includes(names[index]));
 const graph = shareableGraph(template.graph);
 assert.deepEqual(graph, featured.graph);
 assert.equal(graph.nodes.length, 23);
 assert.equal(graph.edges.length, 19);
 assert.equal(graph.nodes.filter(node => node.type === 'image').length, 6);
 assert.equal(graph.nodes.filter(node => node.data.directorStory === true).length, 1);
 assert.ok(graph.nodes.every(node => node.type !== 'loadImage' && !node.output));
 const shots = orderedShots(graph);
 assert.equal(shots.length, 4);
 assert.equal(shots.reduce((seconds, shot) => seconds + shot.data.seconds, 0), 24);
 for (const [order, shot] of shots.entries()) {
  const constraints = videoConstraintFor(shot.data.model);
  assert.equal(shot.data.shotOrder, order);
  assert.ok(shot.data.shotTitle.length > 0);
  assert.equal(shot.data.aspect_ratio, '16:9');
  assert.ok(constraints.resolutions.includes(shot.data.resolution));
  assert.ok(shot.data.seconds >= constraints.minSeconds && shot.data.seconds <= constraints.maxSeconds);
 }
 for (const node of graph.nodes.filter(node => node.type === 'image')) {
  assert.ok(sizeOptionsFor(node.data.model).includes(node.data.size));
  const [width, height] = node.data.size.split('x').map(Number);
  assert.equal(width * 9, height * 16);
 }
}

const workflow = shareableGraph(builtinCanvasTemplate(SHORT_DRAMA_TEMPLATE_ID, 'en').graph);
const spoofed = structuredClone(workflow);
Object.assign(spoofed.nodes.find(node => node.type === 'video').data, { shotTitle: { src: '/private' }, shotOrder: -1 });
const safeShot = shareableGraph(spoofed).nodes.find(node => node.type === 'video');
assert.equal(safeShot.data.shotTitle, undefined);
assert.equal(safeShot.data.shotOrder, undefined);

async function checkShortDramaRun() {
 const inputs = new Map();
 let nodeId;
 const originalFetch = global.fetch;
 global.fetch = async (url, init) => {
  assert.ok(['/api/images', '/api/videos'].includes(url), 'requests remain on mocked generation routes');
  const data = JSON.parse(init.body);
  inputs.set(nodeId, data);
  return Response.json(url === '/api/images' ? { images: [{ url: `https://example.invalid/${nodeId}.jpg` }] } : { url: `https://example.invalid/${nodeId}.mp4` });
 };
 try {
  const order = topoOrder(workflow);
  assert.equal(order.length, workflow.nodes.length);
  await executeGraph(workflow, order, () => {}, undefined, async (node, parents) => {
   nodeId = node.id;
   return runNode(node, parents);
  });
  assert.equal(inputs.size, 10, 'only six stills and four clips hit generation routes');
  assert.deepEqual(inputs.get('pier').image, ['https://example.invalid/wardrobe.jpg']);
  for (const shot of orderedShots(workflow)) {
   const stillId = `${shot.id}-still`;
   assert.deepEqual(inputs.get(stillId).image, ['https://example.invalid/pier.jpg']);
   assert.equal(inputs.get(stillId).prompt, workflow.nodes.find(node => node.id === `${shot.id}-framing`).data.text);
   assert.deepEqual(inputs.get(shot.id).imageUrls, [`https://example.invalid/${stillId}.jpg`]);
   assert.equal(inputs.get(shot.id).generate_audio, false, 'edit-led sound keeps native audio off');
   assert.equal(inputs.get(shot.id).prompt, workflow.nodes.find(node => node.id === `${shot.id}-motion`).data.text);
   assert.equal(shot.output.kind, 'video');
  }
  console.log('PASS: localized short film copies; director metadata; supported sizes; real canvas runner with mocked endpoints and four image-linked clips');
 } finally {
  global.fetch = originalFetch;
 }
}
checkShortDramaRun().catch(error => { console.error(error); process.exitCode = 1; });
