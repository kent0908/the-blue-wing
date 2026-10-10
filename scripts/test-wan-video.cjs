// Offline integration regression: real validators/adapters and route handlers;
// no provider calls, paid generations, database or object storage.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache=new Map();
const mocks={
 './modelMonitoring':{monitoredModelFetch:()=>{throw Error('Network forbidden')}},
 '@/lib/apiauth':{requireUser:async()=>({user:{id:7}})},
 '@/lib/crm':{recordProviderReceipt:async()=>{}},
 '@/lib/alerts':{raiseAlert:async()=>{}},
 '@/lib/generations':{recordGeneration:async()=>{}},
 '@/lib/mediaStore':{persistGeneratedMedia:async()=>{throw Error('Storage forbidden')}},
 '@/lib/creditTransactions':{refundCharge:async()=>{}},
 '@/lib/seedanceDraft':{getOwnedDraftForJob:async()=>null,publicDraft:async()=>null,saveDraftReceipt:async()=>{}},
};
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in mocks)return mocks[id];const local=id.startsWith('@/')?path.resolve(id.slice(2)):id.startsWith('.')?path.resolve(path.dirname(file),id):null;return local?load(local+'.ts'):require(id)},m,m.exports);return m.exports;}
const {wanVideoPayload}=load('lib/wanVideo.ts');
const {validateGeneration}=load('lib/generationValidation.ts');
const {buildVideoModePayload,getGenerationModes}=load('lib/generationModes.ts');
const {videoConstraintFor}=load('lib/videoModels.ts');
let count=0;const check=fn=>{fn();count++};
(async()=>{
 for(const model of ['wan3.0-video','wan3.0-video-prime']){
  const c=videoConstraintFor(model);check(()=>assert.deepEqual(c,{resolutions:['480p','720p','1080p'],minSeconds:2,maxSeconds:30}));
  for(const resolution of c.resolutions)for(const seconds of [2,30]){
   const b={model,prompt:'A blue feather above the sea',resolution,seconds,aspect_ratio:'16:9',generate_audio:false,prompt_extend:false};
   check(()=>validateGeneration(b,'video'));
   const wire=wanVideoPayload({...b,extra_body:{watermark:false},input_references:[{type:'image',url:'https://example.invalid/ref.png'}]});
   check(()=>{assert.equal(wire.resolution,resolution.toUpperCase());assert.equal(wire.generate_audio,false);assert.equal(wire.prompt_extend,false);assert.equal(wire.watermark,false);assert.ok(!('extra_body'in wire));assert.deepEqual(wire.input_references,[{role:'reference_image',url:'https://example.invalid/ref.png'}])});
  }
  for(const extra of [{seconds:1},{seconds:31},{seconds:-1},{seconds:2.5},{resolution:'4k'},{negative_prompt:'x'},{prompt_extend:'true'},{generate_audio:'true'},{aspect_ratio:'bad'},{seed:3.5}])check(()=>assert.throws(()=>validateGeneration({model,prompt:'Sea',resolution:'720p',seconds:2,...extra},'video')));
  const mode={model,prompt:'Sea',seconds:2};
  check(()=>assert.equal(buildVideoModePayload({...mode,mode:'image-to-video',imageUrls:['first']}).frame_images[0].image_url,'first'));
  check(()=>assert.deepEqual(buildVideoModePayload({...mode,mode:'first-last-frame',imageUrls:['first','last']}).frame_images.map(f=>f.frame_type),['first_frame','last_frame']));
  check(()=>assert.throws(()=>buildVideoModePayload({...mode,mode:'subject-reference',references:Array(10).fill({type:'image',url:'ref'})})));
  check(()=>assert.ok(getGenerationModes(model,'video').some(m=>m.id==='first-last-frame')));
 }
 // A saved owned result remains available after the upstream 24h expiry.
 let owner=true,saved=true,provider=0;
 mocks['@/lib/db']={sql:async strings=>({rows:strings.join('').includes('credit_ledger')?(owner?[{id:'charge'}]:[]):saved?[{url:'/api/media/generations/7/retained.mp4'}]:[]})};
 mocks['@/lib/siraya']={...load('lib/siraya.ts'),getVideoStatus:async()=>{provider++;return {status:'succeeded',output_url:'https://example.invalid/video.mp4'}}};
 const {GET}=load('app/api/videos/[id]/route.ts'),{NextRequest}=require('next/server');
 const r=await GET(new NextRequest('https://site.invalid/api/videos/job'),{params:Promise.resolve({id:'job'})});
 check(()=>assert.equal(r.status,200));check(()=>assert.equal(provider,0));
 const out=await r.json();check(()=>assert.equal(out.url,'/api/media/generations/7/retained.mp4'));check(()=>assert.equal(out.status,'completed'));
 owner=false;const denied=await GET(new NextRequest('https://site.invalid/api/videos/job'),{params:Promise.resolve({id:'job'})});check(()=>assert.equal(denied.status,404));check(()=>assert.equal(provider,0));
 console.log(`PASS ${count} Wan wire/validation and expired-result ownership checks.`);
})().catch(e=>{console.error(e);process.exitCode=1});
