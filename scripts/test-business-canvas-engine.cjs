/** Actual B canvas runner with injected HTTP/wait/capture. No network, storage or paid model calls. */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file){file=path.resolve(file);const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts'):require(id),mod,mod.exports);return mod.exports;}
const {createBusinessCanvasRunner}=load('lib/canvas/businessEngine.ts');
const {businessWorkflowsCopy}=load('lib/i18n/businessWorkflows.ts');
const {getSeedanceCapability}=load('lib/businessSeedance.ts');
const {getBusinessDedicatedVideoCapability}=load('lib/businessDedicatedVideo.ts');
const {assertBusinessCanvasPreflight}=load('lib/canvas/businessPreflight.ts');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const privateImage=id=>`/api/business/media/${uuid(900)}/standard/${id}-${uuid(901)}.png`;
const privateVideo=id=>`/api/business/media/${uuid(900)}/standard/${id}-${uuid(901)}.mp4`;
const image={id:'gpt-image-2.5-sunburst',displayName:'GPT Image',modality:'image',nsfw:false,supportsReferences:true,sizes:['1024x1024','1536x1024'],maxReferenceImages:16,imageControls:[{key:'quality',kind:'select',options:['auto','high']}]};
const video={id:'SIRAYA-Seedance-2.5',displayName:'Seedance 2.5',modality:'video',nsfw:false,supportsReferences:true,resolutions:['480p','720p','1080p'],minSeconds:4,maxSeconds:30,defaultSeconds:5,aspectRatios:['adaptive','16:9','9:16'],supportsAudio:true,seedance:getSeedanceCapability('SIRAYA-Seedance-2.5')};
const node=(type,data={},id=`node-${type}`)=>({id,type,x:0,y:0,data});
const outputNode=output=>({...node(output.kind==='text'?'text':'loadImage'),output});
function fixture({locale='zh-Hant',models=[image,video],jobs=[],status=[],capture,handler,waiter}={}){
 const calls=[],waits=[],events=[],captures=[];
 const options={models,copy:businessWorkflowsCopy(locale),onJob:job=>events.push(structuredClone(job)),wait:async(ms,signal)=>{waits.push(ms);signal?.throwIfAborted();if(waiter)await waiter(ms,signal);},fetcher:async(url,init={})=>{const call={url,init,payload:init.body?JSON.parse(init.body):null};calls.push(call);assert.match(url,/^\/api\/business\/generations(?:\/[0-9a-f-]+)?$/);assert.ok(!url.includes('/api/images')&&!url.includes('/api/videos')&&!url.includes('/api/assets'));init.signal?.throwIfAborted();if(handler)return handler(call,calls.length);const result=init.method==='POST'?jobs.shift():status.shift();if(result instanceof Error)throw result;if(result instanceof Response)return result;return Response.json({generation:result});},capture:capture?async(data,signal)=>{captures.push({data,signal});return capture(data,signal);}:undefined};
 return {run:createBusinessCanvasRunner(options),calls,waits,events,captures,t:options.copy};
}
let passed=0;async function test(name,run){await run();passed++;console.log(`PASS B canvas runner: ${name}`);}
const completedImage=(n=1,extra={})=>({id:uuid(n),kind:'image',model:image.id,status:'completed',images:[{url:privateImage(uuid(n))}],...extra});
const completedVideo=(n=2,extra={})=>({id:uuid(n),kind:'video',model:video.id,status:'completed',videoUrl:privateVideo(uuid(n)),...extra});
async function rejects(run,message){await assert.rejects(run,error=>error.message.includes(message));}
(async()=>{
await test('text → image → video passes a business generation UUID rather than a private display URL',async()=>{
 const f=fixture({jobs:[completedImage(1),completedVideo(2)]});
 const text=await f.run(node('text',{text:'A cobalt feather opens into an origami landscape.'}),{});assert.equal(f.calls.length,0);
 const first=await f.run(node('image',{model:image.id,prompt:'fallback ignored',size:'1536x1024',quality:'high'}),{prompt:outputNode(text)});
 assert.deepEqual(first,{kind:'image',items:[{url:privateImage(uuid(1)),businessGenerationId:uuid(1)}]});
 const second=await f.run(node('video',{model:video.id,prompt:'The paper landscape moves in a continuous gentle dolly.',mode:'image-to-video',seconds:6,resolution:'1080p',aspect_ratio:'16:9',generate_audio:true}),{image:outputNode(first)});
 assert.deepEqual(second,{kind:'video',url:privateVideo(uuid(2))});assert.equal(f.calls.length,2);
 const [a,b]=f.calls.map(call=>call.payload);assert.equal(a.kind,'image');assert.equal(a.parameters.prompt,text.text);assert.equal(a.parameters.n,1);assert.equal(a.parameters.quality,'high');assert.equal(a.parameters.size,'1536x1024');
 assert.equal(b.kind,'video');assert.deepEqual(b.parameters.referenceGenerationIds,[uuid(1)]);assert.deepEqual(b.parameters.referenceOrder,[`generated:${uuid(1)}`]);assert.equal(b.parameters.seconds,6);assert.equal(b.parameters.resolution,'1080p');assert.equal(b.parameters.generate_audio,true);assert.equal(b.parameters.assetIds,undefined);
 for(const call of f.calls){assert.equal(call.init.method,'POST');assert.equal(call.init.headers['Content-Type'],'application/json');assert.match(call.payload.clientRequestId,/^[0-9a-f-]{36}$/);assert.ok(!call.init.body.includes('/api/business/media/'));assert.ok(!call.init.body.includes('apiKey'));}assert.notEqual(a.clientRequestId,b.clientRequestId);assert.equal(f.events.length,2);
});
await test('loadImage uses immutable B upload IDs, reconstructs preview URLs, and never imports C assets or forwards src',async()=>{
 const f=fixture({jobs:[completedImage(2)]});const original=await f.run(node('loadImage',{businessItems:[{uploadId:uuid(70),src:'https://untrusted.invalid/not-forwarded.png',name:'one'},{uploadId:uuid(71),src:'/api/assets/99/raw',name:'two'}]}),{});
 assert.deepEqual(original,{kind:'image',items:[{url:`/api/business/provider-assets/uploads/${uuid(70)}/preview`,businessAssetId:uuid(70)},{url:`/api/business/provider-assets/uploads/${uuid(71)}/preview`,businessAssetId:uuid(71)}]});assert.equal(f.calls.length,0);
 await f.run(node('image',{model:image.id,prompt:'Preserve both feather shapes.'}),{image:outputNode(original)});assert.deepEqual(f.calls[0].payload.parameters.businessAssetIds,[uuid(70),uuid(71)]);assert.equal(f.calls[0].payload.parameters.referenceGenerationIds,undefined);assert.ok(!f.calls[0].init.body.includes('untrusted'));assert.ok(!f.calls[0].init.body.includes('/api/assets/'));
 for(const data of[{}, {items:[{assetId:1,src:'/api/assets/1/raw'}]},{businessItems:[]},{businessItems:[null]},{businessItems:[{uploadId:'asset-provider-not-an-original'}]}])await rejects(()=>f.run(node('loadImage',data),{}),f.t.originalRequired);assert.equal(f.calls.length,1);
});
await test('3D capture is saved once as a B upload, honors the signal and then connects through businessAssetIds',async()=>{
 const data='data:image/png;base64,aW1hZ2U=',controller=new AbortController();const f=fixture({jobs:[completedVideo(2)],capture:async()=>({uploadId:uuid(80),src:`/api/business/provider-assets/uploads/${uuid(80)}/preview`})});
 const capture=await f.run(node('director3d',{capturedImage:data}),{},controller.signal);assert.equal(f.captures.length,1);assert.equal(f.captures[0].data,data);assert.equal(f.captures[0].signal,controller.signal);assert.equal(f.calls.length,0);assert.equal(capture.items[0].businessAssetId,uuid(80));
 await f.run(node('video',{model:video.id,prompt:'Follow this camera composition.',mode:'image-to-video'}),{image:outputNode(capture)},controller.signal);assert.deepEqual(f.calls[0].payload.parameters.businessAssetIds,[uuid(80)]);assert.deepEqual(f.calls[0].payload.parameters.referenceOrder,[`business:${uuid(80)}`]);assert.ok(!f.calls[0].init.body.includes(data));
});
await test('missing, oversized, wrong-MIME or failed 3D captures cannot submit a generation',async()=>{
 const f=fixture({capture:async()=>({uploadId:'invalid',src:'/api/assets/1/raw'})});for(const data of[{}, {capturedImage:'data:image/svg+xml;base64,aW1hZ2U='},{capturedImage:'data:image/png;base64,'+'A'.repeat(2800001)}])await rejects(()=>f.run(node('director3d',data),{}),f.t.missingCapture);
 await rejects(()=>f.run(node('director3d',{capturedImage:'data:image/png;base64,aW1hZ2U='}),{}),f.t.captureUploadFailed);assert.equal(f.calls.length,0);assert.equal(f.captures.length,1);
 const noCapture=fixture();await rejects(()=>noCapture.run(node('director3d',{capturedImage:'data:image/png;base64,aW1hZ2U='}),{}),noCapture.t.missingCapture);assert.equal(noCapture.calls.length,0);
});
await test('the actual shared 3D captureBounded emits JPEG; B preflight/runner preserve the real MIME rather than relabeling PNG',async()=>{
 const sharp=require('sharp');const bytes=await sharp({create:{width:640,height:640,channels:3,background:'#246899'}}).jpeg().toBuffer();const data=`data:image/jpeg;base64,${bytes.toString('base64')}`;
 const source=fs.readFileSync('components/canvas/director3d/useDirector3DEditor.ts','utf8')+'\nexport { captureBounded as __captureBounded };';const mod={exports:{}};const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(id=>id.startsWith('@/')?{}:require(id),mod,mod.exports);
 let call=0;const captured=mod.exports.__captureBounded({width:640,height:640,toDataURL(mime,quality){call++;assert.equal(mime,'image/jpeg');assert.equal(quality,0.92);return data;}},0.92);assert.equal(call,1);assert.equal(captured,data);
 const f=fixture({capture:async input=>{assert.equal(input,data);const blob=await(await fetch(input)).blob();assert.equal(blob.type,'image/jpeg');const file=new File([blob],'canvas-capture.jpg',{type:blob.type});assert.equal(file.type,'image/jpeg');assert.equal((await sharp(Buffer.from(await file.arrayBuffer())).metadata()).format,'jpeg');return {uploadId:uuid(80),src:`/api/business/provider-assets/uploads/${uuid(80)}/preview`};}});
 const result=await f.run(node('director3d',{capturedImage:captured}),{});assert.equal(result.items[0].businessAssetId,uuid(80));assert.equal(f.calls.length,0);assert.equal(f.captures.length,1);
 assert.equal(assertBusinessCanvasPreflight({nodes:[node('director3d',{capturedImage:captured},'camera')],edges:[]},['camera'],[image,video],businessWorkflowsCopy('zh-Hant')),undefined);
});
await test('unavailable and wrong-modality models, blank prompts and unsupported references reject before POST',async()=>{
 const f=fixture({models:[image,video,{...image,id:'no-references',supportsReferences:false}]});
 for(const current of[node('image',{model:'removed',prompt:'hello'}),node('video',{model:image.id,prompt:'hello'})])await rejects(()=>f.run(current,{}),f.t.unavailableModel);
 await rejects(()=>f.run(node('image',{model:image.id,prompt:'  '}),{}),f.t.missingPrompt);
 await rejects(()=>f.run(node('image',{model:'no-references',prompt:'hello'}),{image:outputNode({kind:'image',items:[{url:privateImage(uuid(1)),businessGenerationId:uuid(1)}]})}),f.t.invalidReference);
 assert.equal(f.calls.length,0);
});
await test('C references, raw URLs, malformed UUIDs and dual-source records cannot cross into B generation',async()=>{
 const f=fixture();for(const item of[{url:'/api/assets/1/raw',assetId:1},{url:'https://untrusted.invalid/a.png'},{url:'display',businessAssetId:'bad'},{url:'display',businessGenerationId:'provider-task-id'},{url:'display',businessAssetId:uuid(70),businessGenerationId:uuid(1)}])await rejects(()=>f.run(node('image',{model:image.id,prompt:'A gallery'}),{image:outputNode({kind:'image',items:[item]})}),f.t.invalidReference);assert.equal(f.calls.length,0);
});
await test('generic video adapters and duplicate source records refuse references before any HTTP request',async()=>{
 const generic={...video,id:'kling-generic',seedance:undefined};const f=fixture({models:[image,video,generic]});const source={url:privateImage(uuid(1)),businessGenerationId:uuid(1)};
 await rejects(()=>f.run(node('video',{model:generic.id,prompt:'A gallery'}),{image:outputNode({kind:'image',items:[source]})}),f.t.invalidReference);
 await rejects(()=>f.run(node('video',{model:video.id,prompt:'A gallery'}),{image:outputNode({kind:'image',items:[source,source]})}),f.t.invalidReference);assert.equal(f.calls.length,0);
});
await test('mixed original/generated connection order reaches Seedance as ordered point-to-point ID keys',async()=>{
 const f=fixture({jobs:[completedVideo(2)]});const sources=[{url:'not forwarded 1',businessGenerationId:uuid(1)},{url:'not forwarded 2',businessAssetId:uuid(70)}];
 await f.run(node('video',{model:video.id,prompt:'Connect the first frame to the last.',mode:'first-last-frame'}),{image:outputNode({kind:'image',items:sources})});const parameters=f.calls[0].payload.parameters;assert.deepEqual(parameters.businessAssetIds,[uuid(70)]);assert.deepEqual(parameters.referenceGenerationIds,[uuid(1)]);assert.deepEqual(parameters.referenceOrder,[`generated:${uuid(1)}`,`business:${uuid(70)}`]);assert.ok(!f.calls[0].init.body.includes('not forwarded'));
});
await test('pending jobs use bounded read-only polling, the same job UUID, cache no-store and status callbacks',async()=>{
 const f=fixture({jobs:[completedVideo(2,{status:'submitting',videoUrl:undefined})],status:[completedVideo(2,{status:'processing',videoUrl:undefined}),completedVideo(2)]});
 const result=await f.run(node('video',{model:video.id,prompt:'A paper sea.'}),{});assert.equal(result.kind,'video');assert.deepEqual(f.waits,[4000,4000]);assert.equal(f.calls.filter(call=>call.init.method==='POST').length,1);assert.equal(f.calls.length,3);assert.ok(f.calls.slice(1).every(call=>call.url===`/api/business/generations/${uuid(2)}`&&call.init.cache==='no-store'&&!call.init.body));assert.deepEqual(f.events.map(job=>job.status),['submitting','processing','completed']);
});
await test('network uncertainty and explicit unknown outcomes never retry the billable POST',async()=>{
 const f=fixture({jobs:[new TypeError('network connection interrupted')]});await rejects(()=>f.run(node('image',{model:image.id,prompt:'A gallery'}),{}),'network connection interrupted');assert.equal(f.calls.length,1);assert.equal(f.waits.length,0);
 const unknown=fixture({jobs:[completedImage(1,{status:'unknown',images:undefined})]});await rejects(()=>unknown.run(node('image',{model:image.id,prompt:'A gallery'}),{}),`${unknown.t.uncertain} (${uuid(1)})`);assert.equal(unknown.calls.length,1);assert.equal(unknown.events.length,1);assert.equal(unknown.waits.length,0);
});
await test('HTTP refusal and unreadable accepted results stop once and preserve the known error message',async()=>{
 const f=fixture({jobs:[Response.json({error:{message:'The provider has not enabled this model.'}},{status:400})]});await rejects(()=>f.run(node('image',{model:image.id,prompt:'A gallery'}),{}),'The provider has not enabled this model.');assert.equal(f.calls.length,1);
 for(const response of[new Response('not JSON',{status:200}),Response.json({generation:{id:'upstream-not-business-id',status:'completed'}})]){const bad=fixture({jobs:[response]});await rejects(()=>bad.run(node('image',{model:image.id,prompt:'A gallery'}),{}),bad.t.uncertain);assert.equal(bad.calls.length,1);assert.equal(bad.events.length,0);}
});
await test('failed status, missing image/video output and mismatched status UUIDs are explicit errors with no resubmission',async()=>{
 const failed=fixture({jobs:[completedImage(1,{status:'failed',images:undefined})]});await rejects(()=>failed.run(node('image',{model:image.id,prompt:'A gallery'}),{}),`${failed.t.failed} (${uuid(1)})`);assert.equal(failed.calls.length,1);
 for(const [type,model,result]of[['image',image,completedImage(1,{images:[]})],['video',video,completedVideo(2,{videoUrl:undefined})]]){const missing=fixture({jobs:[result]});await rejects(()=>missing.run(node(type,{model:model.id,prompt:'A gallery'}),{}),missing.t.noOutput);assert.equal(missing.calls.length,1);}
 const wrong=fixture({jobs:[completedImage(1,{status:'processing',images:undefined})],status:[completedImage(2)]});await rejects(()=>wrong.run(node('image',{model:image.id,prompt:'A gallery'}),{}),`${wrong.t.uncertain} (${uuid(1)})`);assert.equal(wrong.calls.length,2);assert.equal(wrong.events.length,1);
});
await test('polling has a hard ceiling and unconfirmed jobs are never automatically regenerated',async()=>{
 const f=fixture({handler:async call=>Response.json({generation:completedVideo(2,{status:'processing',videoUrl:undefined})})});await rejects(()=>f.run(node('video',{model:video.id,prompt:'A gallery'}),{}),`${f.t.uncertain} (${uuid(2)})`);assert.equal(f.calls.filter(call=>call.init.method==='POST').length,1);assert.equal(f.calls.length,226);assert.equal(f.waits.length,225);
});
await test('cancel before work performs no capture or HTTP; cancel during polling stops without another POST',async()=>{
 const controller=new AbortController();controller.abort();const f=fixture();await assert.rejects(()=>f.run(node('image',{model:image.id,prompt:'A gallery'}),{},controller.signal),error=>error.name==='AbortError');assert.equal(f.calls.length,0);
 const live=new AbortController();const cancelled=fixture({jobs:[completedVideo(2,{status:'processing',videoUrl:undefined})],waiter:async(_ms,signal)=>{live.abort();signal.throwIfAborted();}});await assert.rejects(()=>cancelled.run(node('video',{model:video.id,prompt:'A gallery'}),{},live.signal),error=>error.name==='AbortError');assert.equal(cancelled.calls.length,1);assert.equal(cancelled.calls[0].init.signal,live.signal);assert.equal(cancelled.events.length,1);
});
await test('version defaults are chosen from exact live model controls and unsupported quality is never forwarded',async()=>{
 const f=fixture({jobs:[completedImage(1),completedVideo(2)],models:[image,{...video,id:'fixed-duration',seedance:undefined,secondsOptions:[4,8],supportsAudio:false}]});await f.run(node('image',{model:image.id,prompt:'A gallery',size:'invalid',quality:'not-enabled'}),{});assert.equal(f.calls[0].payload.parameters.size,'1024x1024');assert.equal(f.calls[0].payload.parameters.quality,undefined);
 await f.run(node('video',{model:'fixed-duration',prompt:'A gallery',seconds:7,resolution:'4k',aspect_ratio:'unknown',generate_audio:true}),{});assert.equal(f.calls[1].payload.parameters.seconds,4);assert.equal(f.calls[1].payload.parameters.resolution,'480p');assert.equal(f.calls[1].payload.parameters.aspect_ratio,'16:9');assert.equal(f.calls[1].payload.parameters.generate_audio,undefined);
});
await test('all three interface languages retain readable safe validation errors',async()=>{
 for(const locale of['zh-Hant','en','ja']){const f=fixture({locale});assert.ok(f.t.unavailableModel&&f.t.invalidReference&&f.t.uncertain);await rejects(()=>f.run(node('image',{model:'missing',prompt:'A gallery'}),{}),f.t.unavailableModel);await rejects(()=>f.run(node('loadImage',{}),{}),f.t.originalRequired);assert.equal(f.calls.length,0);}
});
const edge=(fromNode,toNode,toPort='image',id=`${fromNode}-${toNode}-${toPort}`)=>({id,fromNode,fromPort:'out',toNode,toPort});
const chainGraph=()=>({nodes:[node('text',{text:'A paper gallery'},'prompt'),node('image',{model:image.id},'still'),node('video',{model:video.id,prompt:'A continuous dolly',mode:'image-to-video'},'shot')],edges:[edge('prompt','still','prompt'),edge('still','shot')]});
const preflight=(graph,order=graph.nodes.map(node=>node.id),models=[image,video],locale='zh-Hant')=>assertBusinessCanvasPreflight(graph,order,models,businessWorkflowsCopy(locale));
const originalGraph=(count,target=video,mode='subject-reference')=>({nodes:[node('loadImage',{businessItems:Array.from({length:count},(_,i)=>({uploadId:uuid(70+i),src:'display-only',name:`source ${i}`}))},'sources'),node(target.modality,{model:target.id,prompt:'A gallery',mode},'result')],edges:[edge('sources','result')]});
await test('whole-run preflight accepts the future text/image/video flow without requests or stale outputs',async()=>{
 const graph=chainGraph();graph.nodes[1].output={kind:'image',items:[]};assert.equal(preflight(graph),undefined);
 const standalone={nodes:[node('video',{model:video.id,prompt:'A paper sea',mode:'text-to-video'},'shot')],edges:[]};assert.equal(preflight(standalone),undefined);
});
await test('whole-run preflight blocks an unsupported downstream video before its upstream image can spend',async()=>{
 const graph=chainGraph(),generic={...video,id:'kling-generic',seedance:undefined};graph.nodes[2].data.model=generic.id;assert.throws(()=>preflight(graph,undefined,[image,generic]),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
 graph.nodes[2].data.model='removed-live-model';assert.throws(()=>preflight(graph),{message:businessWorkflowsCopy('zh-Hant').unavailableModel});
});
await test('preflight validates source counts and exact Seedance modes before a run starts',async()=>{
 assert.equal(preflight(originalGraph(2,video,'first-last-frame')),undefined);assert.equal(preflight(originalGraph(1,video,'image-to-video')),undefined);
 for(const graph of[originalGraph(1,video,'first-last-frame'),originalGraph(2,video,'image-to-video'),originalGraph(1,video,'text-to-video'),originalGraph(1,video,'video-edit'),originalGraph(1,video,'video-extend'),originalGraph(1,video,'unreviewed-mode'),originalGraph(17,video,'subject-reference')])assert.throws(()=>preflight(graph),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
 const v20={...video,id:'SIRAYA-Seedance-2.0',seedance:getSeedanceCapability('SIRAYA-Seedance-2.0')};assert.equal(preflight(originalGraph(9,v20),undefined,[image,v20]),undefined);assert.throws(()=>preflight(originalGraph(10,v20),undefined,[image,v20]),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
 const cappedImage={...image,maxReferenceImages:2};assert.equal(preflight(originalGraph(2,cappedImage),undefined,[cappedImage]),undefined);assert.throws(()=>preflight(originalGraph(3,cappedImage),undefined,[cappedImage]),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
});
await test('preflight evaluates newly generated first-image output instead of trusting a saved multi-image preview',async()=>{
 const graph=chainGraph();graph.nodes[2].data.mode='first-last-frame';graph.nodes[1].output={kind:'image',items:[{url:'stale1',businessGenerationId:uuid(1)},{url:'stale2',businessGenerationId:uuid(2)}]};assert.throws(()=>preflight(graph),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
 const loaded=originalGraph(1);loaded.nodes[0].data={};loaded.nodes[0].output={kind:'image',items:[{url:'stale',businessAssetId:uuid(70)}]};assert.throws(()=>preflight(loaded),{message:businessWorkflowsCopy('zh-Hant').originalRequired});
});
await test('preflight checks dedicated i2v/r2v/text contracts instead of presuming every video model accepts an image',async()=>{
 const wan={...video,id:'wan2.7-i2v',seedance:undefined,dedicatedVideo:getBusinessDedicatedVideoCapability('wan2.7-i2v')};assert.equal(preflight(originalGraph(2,wan,'first-last-frame'),undefined,[wan]),undefined);assert.throws(()=>preflight(originalGraph(3,wan,'image-to-video'),undefined,[wan]),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
 const happy={...video,id:'happyhorse-1.1-r2v',seedance:undefined,dedicatedVideo:getBusinessDedicatedVideoCapability('happyhorse-1.1-r2v')};assert.equal(preflight(originalGraph(9,happy),undefined,[happy]),undefined);assert.throws(()=>preflight(originalGraph(10,happy),undefined,[happy]),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
 const t2v={...wan,id:'wan2.7-t2v',dedicatedVideo:getBusinessDedicatedVideoCapability('wan2.7-t2v')};assert.throws(()=>preflight(originalGraph(1,t2v,'freestyle'),undefined,[t2v]),{message:businessWorkflowsCopy('zh-Hant').invalidReference});
});
await test('preflight catches resolution-restricted native audio and CJK prompt caps before an upstream image is billed',async()=>{
 const audio={...video,id:'kling-2.6',seedance:undefined,nativeAudioResolutions:['1080p']};const graph={nodes:[node('video',{model:audio.id,prompt:'A gallery',generate_audio:true,resolution:'720p'},'shot')],edges:[]};assert.throws(()=>preflight(graph,undefined,[audio]),{message:businessWorkflowsCopy('zh-Hant').invalidSettings});graph.nodes[0].data.resolution='1080p';assert.equal(preflight(graph,undefined,[audio]),undefined);
 const happy={...video,id:'happyhorse-1.1-t2v',seedance:undefined,promptMaxChars:5000,dedicatedVideo:getBusinessDedicatedVideoCapability('happyhorse-1.1-t2v')};const cjk={nodes:[node('video',{model:happy.id,prompt:'語'.repeat(2501)},'shot')],edges:[]};assert.throws(()=>preflight(cjk,undefined,[happy]),{message:businessWorkflowsCopy('zh-Hant').invalidSettings});cjk.nodes[0].data.prompt='a'.repeat(5000);assert.equal(preflight(cjk,undefined,[happy]),undefined);cjk.nodes[0].data.prompt='語'.repeat(2500);assert.equal(preflight(cjk,undefined,[happy]),undefined);
});
await test('preflight requires declared finite integer seconds instead of silently clamping or selecting another paid duration',async()=>{
 const graph={nodes:[node('video',{model:video.id,prompt:'A gallery',seconds:5},'shot')],edges:[]};assert.equal(preflight(graph),undefined);for(const seconds of[5.5,0,-1,3,31,NaN,Infinity,'5']){graph.nodes[0].data.seconds=seconds;assert.throws(()=>preflight(graph),{message:businessWorkflowsCopy('zh-Hant').invalidSettings});}
 const fixed={...video,id:'fixed',seedance:undefined,defaultSeconds:4,secondsOptions:[4,8]};graph.nodes[0].data.model=fixed.id;for(const seconds of[5,5.5,7]){graph.nodes[0].data.seconds=seconds;assert.throws(()=>preflight(graph,undefined,[fixed]),{message:businessWorkflowsCopy('zh-Hant').invalidSettings});}for(const seconds of[4,8,undefined]){graph.nodes[0].data.seconds=seconds;assert.equal(preflight(graph,undefined,[fixed]),undefined);}
});
await test('preflight rejects broken or ambiguous execution order, missing endpoints, duplicate inputs and mismatched ports',async()=>{
 const error={message:businessWorkflowsCopy('zh-Hant').invalidReference};const graph=chainGraph();for(const order of[['shot','still','prompt'],['prompt','still','still'],['prompt','missing'],['still','shot']])assert.throws(()=>preflight(graph,order),error);
 for(const change of[{fromNode:'missing'},{toPort:'unknown'},{fromPort:'not-out'},{fromNode:'prompt',toPort:'image'}]){const broken=chainGraph();broken.edges[1]={...broken.edges[1],...change};assert.throws(()=>preflight(broken),error);}
 const duplicate=chainGraph();duplicate.edges.push({...duplicate.edges[1],id:'second-wire'});assert.throws(()=>preflight(duplicate),error);
 const duplicateIds=chainGraph();duplicateIds.nodes.push({...duplicateIds.nodes[0]});assert.throws(()=>preflight(duplicateIds),error);
});
await test('preflight verifies original IDs, duplicate sources, captures and localized prompt requirements without storage access',async()=>{
 for(const locale of['zh-Hant','en','ja']){const t=businessWorkflowsCopy(locale),missing=chainGraph();missing.nodes[0].data.text='';assert.throws(()=>preflight(missing,undefined,undefined,locale),{message:t.missingPrompt});
 const malformed=originalGraph(1);malformed.nodes[0].data.businessItems=[null];assert.throws(()=>preflight(malformed,undefined,undefined,locale),{message:t.originalRequired});
 const repeated=originalGraph(2);repeated.nodes[0].data.businessItems[1].uploadId=repeated.nodes[0].data.businessItems[0].uploadId;assert.throws(()=>preflight(repeated,undefined,undefined,locale),{message:t.invalidReference});
 const capture={nodes:[node('director3d',{},'camera')],edges:[]};assert.throws(()=>preflight(capture,undefined,undefined,locale),{message:t.missingCapture});capture.nodes[0].data.capturedImage='data:image/png;base64,aW1hZ2U=';assert.equal(preflight(capture,undefined,undefined,locale),undefined);}
});
console.log(`Business canvas runner: ${passed} actual runner contracts passed; zero network, storage or paid calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
