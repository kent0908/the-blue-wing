const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
(async()=>{
 const originalFetch=global.fetch;let received=0,calls=0;
 const mod=load('lib/mediaStore.ts',{'./assets':{blobConfigured:()=>true},'@vercel/blob':{put:async(path,body,opts)=>{calls++;assert.equal(opts.access,'private');if(body instanceof ReadableStream){assert.equal(opts.multipart,true);const r=body.getReader();while(true){const v=await r.read();if(v.done)break;received+=v.value.byteLength;}}else{assert.equal(opts.multipart,false);received+=body.length;}return {pathname:path};}}});
 try{
 let produced=0;const stream=new ReadableStream({pull(c){if(produced++===128)c.close();else c.enqueue(new Uint8Array(64*1024));}});
 global.fetch=async()=>({ok:true,body:stream,headers:new Headers({'content-type':'video/mp4'}),arrayBuffer(){throw Error('must not buffer whole file');}});
 assert.match(await mod.persistGeneratedMedia('https://provider.test/video',{userId:7,kind:'video'}),/^\/api\/media\/generations\/7\//);assert.equal(received,8*1024*1024);
 await mod.persistGeneratedMedia('data:image/png;base64,YWJj',{userId:7,kind:'image'});assert.equal(received,8*1024*1024+3);
 let cancelled=false;global.fetch=async()=>({ok:false,body:new ReadableStream({cancel(){cancelled=true;}})});
 assert.equal(await mod.persistGeneratedMedia('https://provider.test/failed',{userId:7,kind:'video'}),'https://provider.test/failed');assert.ok(cancelled);assert.equal(calls,2);
 }finally{global.fetch=originalFetch;}
 const deferred=[];let memoryCalls=0;
 const character={id:7,model:'test',affection:0,likes:[],memory_summary:'old'};
 const route=load('app/api/characters/[id]/messages/route.ts',{
 'next/server':{after:fn=>deferred.push(fn),NextResponse:Response},
 '@/lib/creditTransactions':{paidCall:async(u,c,k,r,fn)=>({result:await fn(),chargeId:'test'}),refundCharge:async()=>{}},
 '@/lib/apiauth':{requireUser:async()=>({user:{id:7}})},
 '@/lib/siraya':{createChatCompletion:async()=>{if(memoryCalls++>0)throw Error('summary unavailable');return {choices:[{message:{content:'reply'}}]};}},
 '@/lib/errors':{errorResponse:()=>Response.json({error:true})},
 '@/lib/credits':{getBalance:async()=>100,creditCost:async()=>1},
 '@/lib/characters':{getCharacter:async()=>character,listMessages:async()=>[],addMessage:async()=>({id:1,content:'reply'}),getPersona:async()=>({}),buildSystemPrompt:()=>'',buildMemoryUpdatePrompt:()=>'',matchesLikes:()=>false,recordTurn:async()=>({affection:1,turnCount:10}),updateMemorySummary:async()=>{},characterLevel:()=>({name:'test'}),MEMORY_REFRESH_EVERY:10}});
 const response=await route.POST(new Request('https://local.test',{method:'POST',body:JSON.stringify({content:'hello'})}),{params:Promise.resolve({id:'7'})});
 assert.equal(response.status,200);assert.equal((await response.json()).reply.content,'reply');assert.equal(memoryCalls,1);assert.equal(deferred.length,1);
 const oldError=console.error;console.error=()=>{};try{await deferred[0]();}finally{console.error=oldError;}assert.equal(memoryCalls,2);
 let stored='old';
 const chars=load('lib/characters.ts',{'./db':{sql:async(strings,summary,id,previous)=>{if(stored===previous)stored=summary;return {rows:[]};}},'./characterProfile':{},'./sceneInteractionPolicy':{},'./promptSafety':{},'./relationshipStages':{},'./companionOfficialSeed':{}});
 await chars.updateMemorySummary(7,'newer','old');
 await chars.updateMemorySummary(7,'late older','old');
 assert.equal(stored,'newer');
 console.log('PASS streaming 8MiB without whole-file buffering, inline fallback, failed-body cancellation; chat returns before memory work and survives summary failure. No external calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
