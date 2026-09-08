const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const src = fs.readFileSync('components/canvas/CanvasEditor.tsx','utf8');
const body = src.split('const save = useCallback(async () => {')[1].split('\n  }, [workflowId, name]);')[0];
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const save = new AsyncFunction('fetch','setSaving','setDirty','workflowId','name','graphRef',body);
const results=[];
(async()=>{
for(const status of [401,403,500]){
 let dirty=true;
 await save(async()=>({ok:false,status}),()=>{},v=>dirty=v,'test','A',{current:{nodes:[],edges:[]}});
 assert.equal(dirty,false);
 results.push({case:'HTTP '+status+' save failure',observed:'dirty=false (incorrect saved indicator)',bug:true});
}
let release;let dirty=true;let stored;
const graphRef={current:{nodes:[{id:'n',data:{text:'before'}}],edges:[]}};
const pending=save(async(_,req)=>{stored=JSON.parse(req.body);return new Promise(r=>release=r)},()=>{},v=>dirty=v,'test','A',graphRef);
graphRef.current={nodes:[{id:'n',data:{text:'after'}}],edges:[]};dirty=true;
release({ok:true,status:200});await pending;
assert.equal(stored.graph.nodes[0].data.text,'before');assert.equal(dirty,false);
results.push({case:'Edit while save pending',observed:'saved snapshot=before; current=after; dirty=false',bug:true});
const runBody=src.split('const setNodeRunState = (id: string, patch: Partial<CanvasNode>) => {')[1].split('\n  };')[0];
let graph={nodes:[{id:'n',data:{text:'hello'}}],edges:[]};dirty=false;
new Function('setGraph','id','patch',runBody)(fn=>graph=fn(graph),'n',{status:'done',output:{kind:'text',text:'hello'}});
assert.equal(graph.nodes[0].output.text,'hello');assert.equal(dirty,false);
results.push({case:'Execution output update',observed:'output changed but dirty remains false',bug:true});
function load(file,imports){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(id=>imports[id],mod,mod.exports);return mod.exports;}
let written;
const route=load('app/api/canvas/route.ts',{'next/server':{NextResponse:{json:x=>x}},'@/lib/apiauth':{requireUser:async()=>({user:{id:123}})},'@/lib/db':{sql:async(strings,...values)=>{written=JSON.parse(values[2]);return {rows:[{id:1,name:'test',graph:written}]}}}});
for(const invalid of [[],{nodes:[{id:'n',type:'unknown'}]}, {nodes:[],edges:[{fromNode:'missing',toNode:'missing'}]}]){
 await route.POST({json:async()=>({name:'isolated-test',graph:invalid})});assert.deepEqual(written,invalid);
 results.push({case:'Graph validation '+JSON.stringify(invalid),observed:'invalid graph reached INSERT',bug:true});
}
const engine=load('lib/canvas/engine.ts',{});
const n=(id)=>({id,type:'text',x:0,y:0,data:{text:id}});
const dag={nodes:[n('a'),n('b')],edges:[{fromNode:'a',toNode:'b',toPort:'prompt'}]};
assert.deepEqual(engine.topoOrder(dag),['a','b']);
assert.deepEqual(await engine.runNode(n('中文\n🙂 1.25'),{}),{kind:'text',text:'中文\n🙂 1.25'});
results.push({case:'DAG order and Unicode text output',observed:'passed',bug:false});
let row={id:1,name:'original',graph:{nodes:[],edges:[]},updated_at:'v1'};let queries=[];
const itemRoute=load('app/api/canvas/[id]/route.ts',{'next/server':{NextResponse:{json:(x,o)=>({body:x,status:o?.status??200})}},'@/lib/apiauth':{requireUser:async()=>({user:{id:123}})},'@/lib/db':{sql:async(strings,...values)=>{queries.push({query:strings.join('?'),values});if(strings.join('').includes('update canvas_workflows')){row={...row,name:values[0]??row.name,graph:values[1]?JSON.parse(values[1]):row.graph};}return {rows:[row]};}}});
const ctx={params:Promise.resolve({id:'1'})};
await itemRoute.PUT({json:async()=>({name:'tab-A',graph:{nodes:[n('A')],edges:[]},updatedAt:'v1'})},ctx);
const stale=await itemRoute.PUT({json:async()=>({name:'tab-B',graph:{nodes:[n('B')],edges:[]},updatedAt:'v1'})},ctx);
assert.equal(stale.status,200);assert.equal(row.name,'tab-B');assert.equal(row.graph.nodes[0].id,'B');
results.push({case:'Stale second tab save',observed:'accepted 200 and overwrote tab A without version comparison',bug:true});
const invalidId=await itemRoute.GET({}, {params:Promise.resolve({id:'1garbage'})});
assert.equal(invalidId.status,200);assert.equal(queries.at(-1).values[0],1);
results.push({case:'Malformed workflow id',observed:'1garbage resolves to workflow 1',bug:true});
assert.ok(queries.every(q=>q.query.includes('user_id = ?')&&q.values.at(-1)===123));
results.push({case:'Owner SQL predicate',observed:'read and update constrain authenticated user id (mock only)',bug:false});
const oneBody=src.split('const runOne = async (nodeId: string) => {')[1].split('\n  };')[0];
const runOne=new AsyncFunction('nodeId','upstreamOrder','graphRef','setNodeRunState','inputsFor','runNode',oneBody);
let runGraph={current:{nodes:[n('run')],edges:[]}};let calls=[];
const update=(id,patch)=>{runGraph.current={...runGraph.current,nodes:runGraph.current.nodes.map(n=>n.id===id?{...n,...patch}:n)}};
const delayed=node=>new Promise(resolve=>calls.push({text:node.data.text,resolve}));
const first=runOne('run',engine.upstreamOrder,runGraph,update,engine.inputsFor,delayed);
const second=runOne('run',engine.upstreamOrder,runGraph,update,engine.inputsFor,delayed);
assert.equal(calls.length,2);
calls.forEach(c=>c.resolve({kind:'text',text:c.text}));await Promise.all([first,second]);
results.push({case:'Two concurrent runOne invocations',observed:'same node executed twice; no shared run lock',bug:true});
calls=[];
const oldRun=runOne('run',engine.upstreamOrder,runGraph,update,engine.inputsFor,delayed);
runGraph.current.nodes[0]={...runGraph.current.nodes[0],data:{text:'changed while running'}};
calls[0].resolve({kind:'text',text:calls[0].text});await oldRun;
assert.equal(runGraph.current.nodes[0].data.text,'changed while running');assert.equal(runGraph.current.nodes[0].output.text,'run');
results.push({case:'Edit while running',observed:'new input retained with old output marked done',bug:true});
const originalFetch=global.fetch;const sent=[];
try {
global.fetch=async(url,req)=>{sent.push({url,body:JSON.parse(req.body)});return {ok:true,json:async()=>url==='/api/images'?{images:[{url:'/api/media/result.png'}]}:{url:'/api/media/result.mp4'}}};
const refs={kind:'image',items:[{url:'/api/assets/21/raw',assetId:21},{url:'/api/media/previous.png'}]};
const inputs={prompt:{output:{kind:'text',text:'connected prompt'}},image:{output:refs}};
await engine.runNode({id:'im',type:'image',data:{model:'test-image',prompt:'fallback',size:'1024x1024'}},inputs);
await engine.runNode({id:'v',type:'video',data:{model:'test-video',seconds:5,resolution:'480p'}},inputs);
assert.deepEqual(sent[0].body.assetIds,[21]);assert.deepEqual(sent[0].body.image,['/api/media/previous.png']);assert.equal(sent[0].body.prompt,'connected prompt');
assert.deepEqual(sent[1].body.assetIds,[21]);assert.deepEqual(sent[1].body.imageUrls,['/api/media/previous.png']);
results.push({case:'Image/video reference payload contract',observed:'asset ids and URL references passed in correct fields; connected prompt preserved (mock fetch)',bug:false});
} finally {global.fetch=originalFetch}
console.log(JSON.stringify(results,null,2));
fs.writeFileSync('canvas-audit-results.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
