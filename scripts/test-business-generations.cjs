/* Actual B2B route + generation library; provider/storage/database are deterministic fixtures. No paid I/O. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map(),jobs=[];let providerCalls=0,lookupCalls=0,uploads=0,activeCredential='11111111-1111-4111-8111-111111111111',revoked=false,approval=true,adult=true,failProvider=null,blobReady=true,failStorage=false,assetRows=[],lastPayload=null,seenKeys=[],upstreamVideo={id:'provider-owned-job',status:'processing'},pollVideo={status:'processing'},kindResult=null;
const account={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId:7,status:'approved'},credentials=new Map([[activeCredential,'sk-fixture-key-original']]);
let rotateDuringReservation=false;
let sourceFetches=[],downloadRedirect=false,localReferenceCalls=0,providerReferenceCalls=0,registeredAssets=[],downloadMime='video/mp4',metadataWriteFails=false,businessUploadCalls=0,businessUploads=[],catalogFailure=false,removedModels=[];
let generatedReferenceCalls=0,generatedSources=[];
let exactImageCalls=0;
const scheduledWork=[];
const models=[['Dola-Seedream-5.0-pro','image'],['NSFW-Dola-Seedream-5.0-pro','image'],['SIRAYA-Seedance-2.5','video'],['NSFW-SIRAYA-Seedance-2.5','video'],['deepseek-v4.1-flash','text'],['veo-3.1-generate-001','video'],['happyhorse-1.0-t2v','video'],['unreviewed-video','video'],['kling-avatar-v2','text'],['embedding-v1','text'],['retired-image','image']];
models.push(...['SIRAYA-Seedance-2.0','SIRAYA-Seedance-2.0-fast','SIRAYA-Seedance-2.0-mini','NSFW-SIRAYA-Seedance-2.0'].map(id=>[id,'video']));
models.push(...['kling-2.5-turbo','kling-2.6','kling-3.0','kling-3.0-turbo','kling-3.0-omni','kling-o1'].map(id=>[id,'video']));
models.push(['minimax-h3','video'],['minimax-h3-max','video'],['minimax-m3','text']);
models.push(...['gpt-image-2','gpt-image-2.5-flare','gpt-image-2.5-sunburst','gemini-3.1-flash-image','gemini-3.1-flash-lite-image','gemini-3-pro-image','ByteDance-Seedream-4.0','ByteDance-Seedream-4.5','Dola-Seedream-5.0-lite','NSFW-Seedream-4.0','NSFW-Seedream-4.5','NSFW-Seedream-5.0-lite'].map(id=>[id,'image']));
models.push(...['claude-opus-5.5','gpt-6.1','uncensored-gpt-6','qwen3.8-max','kimi-k3','deepseek-v4-flash'].map(id=>[id,'text']));
models.push(...['kling-tts','qwen3-asr-flash','gemini-embedding-2','wan2.7-t2v','wan2.7-i2v','wan2.7-r2v','wan2.7-videoedit','happyhorse-1.1-t2v','happyhorse-1.1-i2v','happyhorse-1.1-r2v'].map(id=>[id,'tool']));
const wanSpicyModels = ['wan3.0-video-spicy', 'wan3.0-video-pro-spicy', 'wan3.0-video-prime-spicy', 'wan3.0-video-prime-pro-spicy'];
models.push(['wan3.0-video-pro','video'], ...wanSpicyModels.map(id => [id,'video']));
models.push(['wan2.2-i2v-spicy','video'],['wan2.7-i2v-spicy','video']);
models.push(['z-image-spicy','image'],['z-image-spicy-pro','image']);
models.push(['gemini-nano-banana-2.1', 'image']);
const rates=models.map(([modelId,modality])=>({modelId,modality,active:modelId!=='retired-image',credits:999}));
class BusinessError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
class SirayaApiError extends Error{constructor(status,message,type,code){super(message);this.status=status;this.type=type;this.code=code;}}
class NextRequest extends Request{get nextUrl(){return new URL(this.url)}}
const NextResponse={json:(body,opts={})=>Response.json(body,opts)};
function user(){return {id:7,role:'user',birth_date:adult?'1990-01-01':'2015-01-01'}}
const businessJson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private,no-store'}});
const businessErrorResponse=(_req,error)=>businessJson({error:{code:error.code??'unavailable',message:'Sanitized error'}},error.status??503);
let lock=Promise.resolve();
const clone=row=>row?JSON.parse(JSON.stringify(row)):row;
async function query(q,p=[]){q=q.replace(/\s+/g,' ').toLowerCase();
 if(q==='begin'||q==='commit'||q==='rollback')return {rows:[]};
 if(q.includes('from business_accounts')){if(rotateDuringReservation){activeCredential='22222222-2222-4222-8222-222222222222';credentials.set(activeCredential,'sk-fixture-key-rotated');rotateDuringReservation=false;}return {rows:approval?[{id:account.id}]:[]};}
 if(q.includes('from business_credentials'))return {rows:!revoked&&p[0]===activeCredential?[{id:activeCredential}]:[]};
 if(q.startsWith('select count(*)'))return {rows:[{count:String(jobs.filter(j=>j.account_id===p[0]&&p[1].includes(j.status)&&
   !(j.status==='submitting'&&Date.now()-new Date(j.submitted_at??j.created_at).getTime()>=360_000)&&
   !(j.status==='processing'&&!j.provider_task_id&&!j.provider_output&&Date.now()-new Date(j.submitted_at??j.created_at).getTime()>=120_000)).length)}]};
 if(q.startsWith('insert into business_generations')){const row={id:p[0],account_id:p[1],user_id:p[2],credential_id:p[3],client_request_id:p[4],kind:p[5],model:p[6],prompt:p[7],nsfw:p[8],status:'submitting',provider_task_id:null,provider_output:null,output:p[9]?JSON.parse(p[9]):null,error_code:null,provider_request_id:null,provider_http_status:null,provider_request_ids:[],provider_receipt_count:0,submitted_at:null,completed_at:null,duration_ms:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};jobs.push(row);return {rows:[clone(row)]};}
 if(q.startsWith('select * from business_generations')){if(q.includes('client_request_id=$3'))return {rows:jobs.filter(j=>j.account_id===p[0]&&j.user_id===p[1]&&j.client_request_id===p[2]&&(p.length===3||p[3]||!j.nsfw)).map(clone)};if(q.includes('id=$1 and account_id=$2'))return {rows:jobs.filter(j=>j.id===p[0]&&j.account_id===p[1]&&j.user_id===p[2]).map(clone)};return {rows:jobs.filter(j=>j.account_id===p[0]&&j.user_id===p[1]&&(p[2]||!j.nsfw)).map(clone)};}
 if(q.startsWith("select jsonb_build_object('reuseinput'"))return {rows:jobs.filter(j=>j.id===p[0]&&j.account_id===p[1]&&j.user_id===p[2]).map(({output,nsfw})=>({output:{reuseInput:clone(output?.reuseInput)??null},nsfw}))};
 if(q.startsWith('select id,content_type,size from assets'))return {rows:assetRows.filter(a=>a.user_id===p[0]&&p[1].includes(a.id))};
 if(q.startsWith('select id,user_id,url,pathname,content_type,size,filename,created_at from assets'))return {rows:assetRows.filter(a=>a.user_id===p[0]&&p[1].includes(a.id)).map(a=>({pathname:`assets/${a.user_id}/${a.id}.png`,url:'https://private-blob.invalid/source',filename:'Mio.png',created_at:'2026-11-10',...a}))};
 if(q.startsWith('update business_generations set submitted_at=')){const row=jobs.find(j=>j.id===p[1]&&j.account_id===p[2]&&j.user_id===p[3]&&j.status==='submitting'&&!j.submitted_at&&Date.now()-new Date(j.created_at).getTime()<360_000);if(!row)return {rows:[]};row.submitted_at=p[0];return {rows:[clone(row)]};}
 if(q.startsWith('update business_generations set status=case')){
   const row=jobs.find(j=>j.id===p[0]&&j.account_id===p[1]&&j.user_id===p[2]&&j.status==='submitting');
   if(!row || (p[3]&&Date.now()-new Date(row.submitted_at??row.created_at).getTime()<360_000))return {rows:[]};
   row.status=row.submitted_at?'unknown':'failed';
   row.error_code=row.submitted_at?'outcome_unknown':'submission_interrupted';
   if(!row.submitted_at)row.completed_at=new Date().toISOString();
   return {rows:[clone(row)]};
 }
 if(q.startsWith('update business_generations set provider_request_id=')){if(metadataWriteFails){metadataWriteFails=false;throw Error('fixture transient receipt write failure');}const row=jobs.find(j=>j.id===p[2]&&j.account_id===p[3]&&j.user_id===p[4]);assert.ok(row);row.provider_request_id=p[0];row.provider_http_status=p[1];row.provider_request_ids=p[5];row.provider_receipt_count=p[6];return {rows:[]};}
 if(q.startsWith('update business_generations set status=')){const row=jobs.find(j=>j.id===p[5]&&j.account_id===p[6]&&j.user_id===p[7]);assert.ok(row);row.status=p[0];const output=p[1]?JSON.parse(p[1]):null;assert.match(q,/coalesce\(\$2::jsonb,'\{\}'::jsonb\) \|\| jsonb_build_object\('reuseinput',output->'reuseinput'\)/);row.output=row.output?.reuseInput?{...output,reuseInput:row.output.reuseInput}:output;row.error_code=p[2];if(p[3])row.provider_output=JSON.parse(p[3]);if(p[4])row.provider_task_id=p[4];if(p[8])row.provider_request_id=p[8];if(p[9])row.provider_http_status=p[9];row.provider_request_ids=p[10];row.provider_receipt_count=p[11];row.completed_at??=p[12];row.duration_ms??=p[13];return {rows:[clone(row)]};}
 if(q.startsWith('update business_generations set reconcile_after=now()')){
   assert.match(q, /\$4::boolean and status='failed' and error_code='result_missing' and provider_task_id is not null/);
   const row=jobs.find(j=>j.id===p[0]&&j.account_id===p[1]&&j.user_id===p[2]);
   const recoverable=p[3] && row?.status==='failed' && row.error_code==='result_missing' && row.provider_task_id;
   const retryUnknown=p[4] && row?.status==='unknown' && (row.provider_task_id || row.provider_output);
   if(!row || (row.status!=='processing' && !recoverable && !retryUnknown) || row.reconcile_after)return {rows:[]};
   row.reconcile_after=true;
   return {rows:[clone(row)]};
 }
 if(q.startsWith('update business_generations set reconcile_after=null')){const row=jobs.find(j=>j.id===p[0]);if(row)row.reconcile_after=null;return {rows:[]};}
 throw Error('Unexpected SQL fixture: '+q);
}
const sql={query,connect:async()=>{let release;return {query:async(q,p)=>{if(q.includes('business_accounts')&&q.includes('for update')){const prior=lock;lock=new Promise(r=>release=r);await prior;}return query(q,p)},release:()=>release?.()}}};
async function provider(kind,payload,options){providerCalls++;lastPayload=payload;seenKeys.push(options.apiKey);assert.ok(!JSON.stringify(payload).includes('sk-fixture'));if(!failProvider||failProvider instanceof SirayaApiError){try{await options.onRequestMetadata?.({requestId:'fixture-provider-request',httpStatus:failProvider?.status??200});}catch{/* Real Siraya client keeps the accepted result after a receipt writer failure. */}}if(failProvider)throw failProvider;await new Promise(resolve=>setTimeout(resolve,3));if(kindResult)return kindResult;if(kind==='text')return {choices:[{message:{content:'A paper city unfolds.'}}]};if(kind==='image')return {data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'}]};return upstreamVideo;}
const mocks={
 'next/server':{NextRequest,NextResponse,after:callback=>scheduledWork.push(callback)},
 './db':{sql},'./assets':{blobConfigured:()=>blobReady,assetPathPrefix:id=>`assets/${id}/`,toPublicAsset:a=>({id:a.id,src:`/api/assets/${a.id}/raw`,name:a.filename,contentType:a.content_type,size:a.size,createdAt:a.created_at})},'./assetData':{assetsToDataUrls:async(_user,ids,limit)=>{assert.ok(ids.length<=limit);return ids.map(()=> 'data:image/png;base64,aW1hZ2U=')}},
 './businessReferenceUrls':{createBusinessReferenceUrls:async(userId,accountId,credentialId,ids,nsfw,profile)=>{
   localReferenceCalls++;
   assert.equal(accountId,account.id);
   assert.equal(credentialId,activeCredential);
   assert.equal(typeof nsfw,'boolean');
   assert.ok(profile===undefined || profile==='wan');
   const types=['image/png','image/jpeg','image/webp',...(profile==='wan'?[]:['image/gif'])];
   const maxBytes=profile==='wan'?20*1024*1024:30*1024*1024-1;
   if(ids.some(id=>!assetRows.some(row=>row.id===id&&row.user_id===userId&&types.includes(row.content_type)&&row.size<=maxBytes)))throw new BusinessError('invalid_reference');
   return ids.map(id=>({type:'image',url:`https://fixture.invalid/api/business/references/opaque-${id}`,role:'reference_image'}));
 }},
 './businessProviderAssets':{getBusinessProviderAsset:async(id,{apiKey})=>{assert.equal(apiKey,credentials.get(activeCredential));const asset=registeredAssets.find(asset=>asset.id===id&&asset.apiKey===apiKey);if(!asset)throw Error('private provider failure');return {id,type:asset.type,name:'Registered character',status:asset.status};},resolveBusinessProviderAssets:async(refs,credential)=>{providerReferenceCalls++;assert.equal(credential.apiKey,credentials.get(activeCredential));if(refs.some(ref=>!registeredAssets.some(asset=>asset.id===ref.id&&asset.type===ref.type&&asset.status==='active'&&asset.apiKey===credential.apiKey)))throw new BusinessError('invalid_reference');return refs.map(ref=>({type:ref.type,url:`asset://${ref.id}`,role:`reference_${ref.type}`}));}},
 '@vercel/blob':{put:async(pathname,_bytes,opts)=>{assert.equal(opts.access,'private');uploads++;if(failStorage)throw Error('Private storage outage');return {pathname}}},
 './business':{BusinessError,businessJson,businessErrorResponse,requireBusiness:async()=>approval?{user:user(),account}:{error:businessJson({error:{code:'business_not_approved'}},403)},assertBusinessOrigin:req=>{if(req.headers.get('origin')!==req.nextUrl.origin)throw new BusinessError('invalid_origin',403)},readBusinessJson:async req=>req.json(),getBusinessCredential:async(_user,_account,id)=>!approval||revoked?null:{id:id??activeCredential,apiKey:credentials.get(id??activeCredential)}},
 './rateCard':{listRates:async()=>{throw Error('C retail catalog must never govern BYOK')}},
 './businessAssetUploads':{reusableBusinessUploads:async(userId,accountId,ids)=>{assert.equal(userId,7);assert.equal(accountId,account.id);return ids.filter(id=>businessUploads.includes(id)).map(id=>({id,uploadId:id,name:'Original upload',type:'image',status:'active',storageReady:true}));},resolveBusinessUploadSources:async(userId,accountId,credentialId,ids,nsfw)=>{businessUploadCalls++;assert.equal(userId,7);assert.equal(accountId,account.id);assert.equal(credentialId,activeCredential);assert.equal(typeof nsfw,'boolean');if(ids.some(id=>!businessUploads.includes(id)))throw new BusinessError('invalid_reference');return ids.map(id=>({type:'image',url:`https://fixture.invalid/api/business/provider-assets/source/opaque-${id}`}));}},
 './businessGeneratedReferences':{reusableBusinessGeneratedImageIds:async(userId,accountId,credentialId,ids,nsfw)=>{assert.equal(userId,7);assert.equal(accountId,account.id);assert.equal(credentialId,activeCredential);assert.equal(typeof nsfw,'boolean');return ids.filter(id=>generatedSources.includes(id));},resolveBusinessGeneratedImageSources:async(userId,accountId,credentialId,ids,nsfw)=>{generatedReferenceCalls++;assert.equal(userId,7);assert.equal(accountId,account.id);assert.equal(credentialId,activeCredential);assert.equal(typeof nsfw,'boolean');if(ids.some(id=>!generatedSources.includes(id)))throw new BusinessError('invalid_reference');return ids.map(id=>({type:'image',url:`https://fixture.invalid/api/business/generated-references/opaque-${id}`}));}},
 './siraya':{SirayaApiError,createImage:(payload,options)=>provider('image',payload,options),createBusinessImage:(payload,options)=>{exactImageCalls++;return provider('image',payload,options)},createVideo:(payload,options)=>provider('video',payload,options),createBusinessVideo:(payload,options)=>provider('video',payload,options),createChatCompletion:(payload,options)=>provider('text',payload,options),listModels:async options=>{lookupCalls++;seenKeys.push(options.apiKey);if(catalogFailure)throw Error('private upstream error');return {data:models.filter(([id])=>!removedModels.includes(id)).map(([id])=>({id}))}},getVideoStatus:async(id,options)=>{lookupCalls++;assert.equal(id,'provider-owned-job');seenKeys.push(options.apiKey);if(pollVideo instanceof Error)throw pollVideo;return pollVideo}},
};
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(id=>{const canonical=id.startsWith('@/lib/')?'./'+id.slice(6):id;if(canonical in mocks)return mocks[canonical];if(id.startsWith('@/'))return load(path.resolve(id.slice(2))+'.ts');if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');return require(id)},mod,mod.exports);return mod.exports;}
const routes=load('app/api/business/generations/route.ts'),single=load('app/api/business/generations/[id]/route.ts'),reuse=load('app/api/business/generations/[id]/reuse/route.ts'),catalog=load('app/api/business/models/route.ts');
const originalFetch=global.fetch;global.fetch=async(url,init)=>{sourceFetches.push(url);assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).has('Authorization'),false);return downloadRedirect?new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}):new Response(Buffer.from('fixture-video'),{headers:{'content-type':downloadMime}})};
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const body=(n=1,kind='video',parameters={})=>({clientRequestId:uuid(n),kind,parameters:{model:kind==='video'?'SIRAYA-Seedance-2.5':kind==='image'?'Dola-Seedream-5.0-pro':'deepseek-v4.1-flash',prompt:'A blue feather crosses a paper city',...parameters}});
const request=(payload,origin='https://fixture.invalid')=>new NextRequest('https://fixture.invalid/api/business/generations',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(payload)});
const send=(payload=body(),origin)=>routes.POST(request(payload,origin));
const queue=(payload=body())=>routes.POST(new NextRequest('https://fixture.invalid/api/business/generations',{
  method:'POST',headers:{'content-type':'application/json',origin:'https://fixture.invalid',prefer:'respond-async'},body:JSON.stringify(payload),
}));
const get=(id,query='',headers)=>single.GET(new NextRequest(`https://fixture.invalid/api/business/generations/${id}${query}`,{headers}),{params:Promise.resolve({id})});
const lookupSubmission=id=>routes.GET(new NextRequest(`https://fixture.invalid/api/business/generations?clientRequestId=${encodeURIComponent(id)}`));
const getReuse=id=>reuse.GET(new NextRequest(`https://fixture.invalid/api/business/generations/${id}/reuse`),{params:Promise.resolve({id})});
function reset(){jobs.length=0;providerCalls=lookupCalls=uploads=localReferenceCalls=providerReferenceCalls=0;approval=adult=blobReady=true;revoked=failStorage=rotateDuringReservation=downloadRedirect=metadataWriteFails=false;failProvider=kindResult=null;seenKeys=[];sourceFetches=[];lastPayload=null;assetRows=[];registeredAssets=[];downloadMime='video/mp4';businessUploadCalls=0;businessUploads=[];generatedReferenceCalls=0;generatedSources=[];catalogFailure=false;removedModels=[];activeCredential='11111111-1111-4111-8111-111111111111';credentials.set(activeCredential,'sk-fixture-key-original');upstreamVideo={id:'provider-owned-job',status:'processing'};pollVideo={status:'processing'};lock=Promise.resolve()}
let count=0;async function test(name,fn){reset();exactImageCalls=0;await fn();count++;console.log('PASS '+name)}
(async()=>{
 await test('every model/list/create/poll route checks current approval',async()=>{approval=false;for(const response of [await catalog.GET(new NextRequest('https://fixture.invalid/api/business/models')),await routes.GET(new NextRequest('https://fixture.invalid/api/business/generations')),await send(),await get(uuid(1))]){assert.equal(response.status,403);assert.match(response.headers.get('cache-control'),/no-store/)}assert.equal(providerCalls+lookupCalls,0)});
 await test('cross-origin POST is rejected before provider I/O',async()=>{assert.equal((await send(body(),'https://evil.invalid')).status,403);assert.equal(providerCalls,0)});
 await test('own-key catalog exposes all grants with executable or explicit unavailable status, independent of C prices',async()=>{const response=await catalog.GET(new NextRequest('https://fixture.invalid/api/business/models'));const json=await response.json();assert.equal(lookupCalls,1);assert.deepEqual(seenKeys,['sk-fixture-key-original']);for(const id of ['happyhorse-1.0-t2v','unreviewed-video','kling-avatar-v2','embedding-v1','retired-image'])assert.ok(!json.models.some(m=>m.id===id));assert.ok(json.models.some(m=>m.nsfw));assert.equal(json.upstreamTotal,models.length);assert.equal(json.models.length+json.unavailableModels.length,models.length);assert.ok(json.unavailableModels.find(m=>m.id==='kling-avatar-v2'&&m.reason==='dedicated_tool'));assert.ok(json.models.find(m=>m.id==='gpt-6.1'));assert.ok(json.models.find(m=>m.id==='gpt-image-2.5-flare'));assert.ok(json.models.find(m=>m.id==='NSFW-Seedream-4.5'));assert.ok(json.models.find(m=>m.id==='uncensored-gpt-6'&&m.nsfw));assert.ok(json.models.find(m=>m.id==='veo-3.1-generate-001').secondsOptions.includes(8))});
 await test('same UUID concurrent requests reserve once and perform only one paid POST',async()=>{const responses=await Promise.all([send(),send()]);assert.ok(responses.every(r=>[200,201].includes(r.status)));assert.equal(providerCalls,1);assert.equal(jobs.length,1);assert.ok((await responses[0].json()).generation.id);assert.equal(lookupCalls,2)});
 await test('async image response returns a durable receipt before provider I/O and duplicate replays do not schedule another worker',async()=>{
   const payload=body(1,'image');
   const responses=await Promise.all([queue(payload),queue(payload)]);
   assert.deepEqual(responses.map(response=>response.status).sort(),[200,202]);
   assert.equal(responses[0].headers.get('Preference-Applied'),'respond-async');
   const queued=await responses[0].json();
   assert.equal(queued.generation.status,'submitting');
   assert.equal(queued.generation.clientRequestId,payload.clientRequestId);
   assert.equal(providerCalls,0);
   assert.equal(scheduledWork.length,1);
   assert.equal((await (await get(queued.generation.id)).json()).generation.status,'submitting');
   await scheduledWork.shift()();
   assert.equal((await (await get(queued.generation.id)).json()).generation.status,'completed');
   assert.equal(providerCalls,1);
   assert.equal(uploads,1);
 });
 await test('background provider rejection becomes a terminal failure and frees the next submission',async()=>{
   const response=await queue(body(1,'image'));
   const queued=await response.json();
   failProvider=new SirayaApiError(402,'fixture quota error');
   await scheduledWork.shift()();
   const failed=(await(await get(queued.generation.id)).json()).generation;
   assert.equal(failed.status,'failed');
   assert.equal(failed.errorCode,'provider_quota');
   assert.equal(providerCalls,1);
   assert.equal((await queue(body(2,'image'))).status,202);
   assert.equal(providerCalls,1);
   scheduledWork.shift();
 });
 await test('abandoned reservations settle safely, and a late worker cannot dispatch an expired reservation',async()=>{
   const first=await(await queue(body(1))).json();
   const second=await(await queue(body(2))).json();
   jobs.forEach(job=>job.created_at=new Date(Date.now()-420_000).toISOString());
   jobs[1].submitted_at=jobs[1].created_at;
   const neverSubmitted=(await(await get(first.generation.id)).json()).generation;
   const unconfirmed=(await(await get(second.generation.id)).json()).generation;
   assert.equal(neverSubmitted.status,'failed');
   assert.equal(neverSubmitted.errorCode,'submission_interrupted');
   assert.equal(unconfirmed.status,'unknown');
   assert.equal(unconfirmed.errorCode,'outcome_unknown');
   while(scheduledWork.length)await scheduledWork.shift()();
   assert.equal(providerCalls,0);
   assert.equal((await queue(body(2))).status,200);
   assert.equal(scheduledWork.length,0);
 });
 await test('acknowledgement recovery finds only the exact allowed receipt without dispatching or polling',async()=>{
   const payload=body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5'});
   const queued=await(await queue(payload)).json();
   assert.equal((await(await lookupSubmission(payload.clientRequestId)).json()).generation.id,queued.generation.id);
   assert.equal((await(await lookupSubmission(uuid(2))).json()).generation,null);
   assert.equal((await lookupSubmission('invalid')).status,400);
   adult=false;
   assert.equal((await(await lookupSubmission(payload.clientRequestId)).json()).generation,null);
   adult=true;
   jobs[0].user_id=8;
   assert.equal((await(await lookupSubmission(payload.clientRequestId)).json()).generation,null);
   assert.equal(providerCalls,0);
   assert.equal(lookupCalls,1);
   scheduledWork.shift();
 });
 await test('newly accepted videos tolerate status propagation, and stale missing tasks can be rechecked without resubmitting',async()=>{
   const queued=await(await send()).json();
   pollVideo=new SirayaApiError(404,'fixture task unavailable');
   assert.equal((await(await get(queued.generation.id)).json()).generation.status,'processing');
   jobs[0].submitted_at=new Date(Date.now()-180_000).toISOString();
   const stale=(await(await get(queued.generation.id)).json()).generation;
   assert.equal(stale.status,'unknown');
   assert.equal(stale.canRecheck,true);
   assert.equal(stale.provider_task_id,undefined);
   pollVideo={status:'processing'};
   assert.equal((await(await get(queued.generation.id,'?recheck=1')).json()).generation.status,'processing');
   assert.equal(providerCalls,1);
 });
 await test('old processing records with no provider information become unknown and stop occupying the active queue',async()=>{
   for(let index=1;index<=4;index++)await send(body(index));
   for(const row of jobs){row.provider_task_id=null;row.submitted_at=new Date(Date.now()-180_000).toISOString();}
   const settled=(await(await get(jobs[0].id)).json()).generation;
   assert.equal(settled.status,'unknown');
   assert.equal(settled.canRecheck,undefined);
   assert.equal((await queue(body(5))).status,202);
   assert.equal(providerCalls,4);
   scheduledWork.shift();
 });
 await test('maximum four pending reservations enforced across concurrent calls',async()=>{const responses=await Promise.all([1,2,3,4,5,6].map(n=>send(body(n))));assert.equal(responses.filter(r=>r.status===429).length,2);assert.equal(providerCalls,4);assert.equal(jobs.length,4)});
 await test('duplicate request stays recoverable after key removal and does not repeat',async()=>{await send();revoked=true;const response=await send();assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);assert.equal(providerCalls,1)});
 await test('new calls fail closed if key is absent',async()=>{revoked=true;assert.equal((await send()).status,409);assert.equal(providerCalls,0);assert.equal(jobs.length,0)});
 await test('unknown network outcome is durable and same UUID is never replayed',async()=>{failProvider=new TypeError('secret network failure sk-should-never-leak');let response=await send();let json=await response.json();assert.equal(json.generation.status,'unknown');assert.equal(json.generation.errorCode,'outcome_unknown');assert.ok(!JSON.stringify(json).includes('sk-should'));failProvider=null;response=await send();assert.equal((await response.json()).generation.status,'unknown');assert.equal(providerCalls,1)});
 await test('explicit upstream quota refusal is stored sanitized and no fallback',async()=>{failProvider=new SirayaApiError(402,'sk-provider-secret balance');const response=await send();const json=await response.json();assert.equal(json.generation.status,'failed');assert.equal(json.generation.errorCode,'provider_quota');assert.ok(!JSON.stringify(json).includes('sk-provider'));await send();assert.equal(providerCalls,1)});
 await test('NSFW creation and duplicate replay require adult verification',async()=>{adult=false;assert.equal((await send(body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5'}))).status,403);assert.equal(providerCalls,0);adult=true;await send(body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5'}));adult=false;assert.equal((await send(body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5'}))).status,403);assert.equal(providerCalls,1)});
 await test('NSFW poll checks age independently and never queries vendor while under age',async()=>{await send(body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5'}));adult=false;assert.equal((await get(jobs[0].id)).status,403);assert.equal(lookupCalls,1)});
 await test('NSFW history hidden until adult verification',async()=>{await send(body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5'}));adult=false;const response=await routes.GET(new NextRequest('https://fixture.invalid/api/business/generations'));assert.deepEqual((await response.json()).generations,[])});
 await test('blocked minor prompt rejected before any reservation or provider I/O',async()=>{assert.equal((await send(body(1,'image',{prompt:'a 15 years old person'}))).status,400);assert.equal(providerCalls,0);assert.equal(jobs.length,0)});
 await test('arbitrary URL, passthrough, draft, foreign credential and task IDs rejected',async()=>{for(const parameters of [{image:'https://evil.invalid/image'},{extra_body:{url:'https://evil.invalid'}},{draft:true},{credentialId:uuid(9)},{provider_task_id:'other-job'},{endpoint:'https://evil.invalid'}])assert.equal((await send(body(1,'image',parameters))).status,400);assert.equal(providerCalls,0)});
 await test('pasted credentials never reach plaintext prompts, history or provider',async()=>{for(const prompt of ['A city sk-fixture_not_a_real_secret_value','A city CSK-fixture_not_a_real_secret_value'])assert.equal((await send(body(1,'image',{prompt}))).status,400);assert.equal(jobs.length,0);assert.equal(providerCalls,0)});
 await test('unknown/disabled/wrong modality model rejected before reservation',async()=>{for(const model of ['unreviewed-video','SIRAYA-Seedance-2.5','retired-image'])assert.equal((await send(body(1,'image',{model}))).status,400);assert.equal(jobs.length,0)});
 await test('owned raster references resolved only by ID; missing foreign asset rejects',async()=>{assetRows=[{id:1,user_id:99,content_type:'image/png',size:100}];assert.equal((await send(body(1,'image',{assetIds:[1]}))).status,400);assert.equal(providerCalls,0);assetRows=[{id:1,user_id:7,content_type:'image/png',size:100}];const response=await send(body(2,'image',{assetIds:[1]}));assert.equal(response.status,201);assert.match(lastPayload.image,/^data:image\/png/);assert.equal(lastPayload.assetIds,undefined)});
 await test('oversized or executable references rejected before provider',async()=>{for(const row of [{id:1,user_id:7,content_type:'image/svg+xml',size:10},{id:1,user_id:7,content_type:'image/png',size:11000000}]){assetRows=[row];assert.equal((await send(body(1,'image',{assetIds:[1]}))).status,400)}assert.equal(providerCalls,0)});
 await test('image gets native hires default and private business media output',async()=>{const response=await send(body(1,'image'));const json=await response.json();assert.equal(json.generation.status,'completed');assert.equal(lastPayload.size,'2048x2048');assert.match(json.generation.images[0].url,/^\/api\/business\/media\/.+\/standard\//);assert.ok(!JSON.stringify(json).includes('provider_output'));assert.equal(uploads,1)});
 await test('Nano Banana 2.1 uses the exact image ID, panoramic size, and single output', async () => {
   const model = 'gemini-nano-banana-2.1';
   const response = await send(body(1, 'image', { model, size: '1024x128', n: 1 }));
   assert.equal((await response.json()).generation.status, 'completed');
   assert.equal(lastPayload.model, model);
   assert.equal(lastPayload.size, '1024x128');
   assert.equal(lastPayload.n, 1);
   assert.equal(providerCalls, 1);
 });
 await test('adult image output has adult namespace',async()=>{const response=await send(body(1,'image',{model:'NSFW-Dola-Seedream-5.0-pro'}));assert.match((await response.json()).generation.images[0].url,/\/adult\//)});
 await test('Z-Image Spicy submits the exact own-key payload and stores the result in adult media', async () => {
   const payload = body(1, 'image', {model:'z-image-spicy',size:'1024x1024',n:1});
   const response = await send(payload);
   assert.equal(response.status, 201);
   const { generation } = await response.json();
   assert.equal(generation.status, 'completed');
   assert.match(generation.images[0].url, /^\/api\/business\/media\/.+\/adult\//);
   assert.equal(jobs[0].nsfw, true);
   assert.equal(exactImageCalls, 1);
   assert.equal(providerCalls, 1);
   assert.deepEqual(seenKeys, ['sk-fixture-key-original', 'sk-fixture-key-original']);
   assert.equal(lastPayload.model, payload.parameters.model);
   assert.equal(lastPayload.prompt, payload.parameters.prompt);
   assert.equal(lastPayload.size, '1024x1024');
   assert.equal(lastPayload.prompt_extend, false);
   for (const key of ['n', 'image', 'watermark', 'extra_body']) assert.equal(lastPayload[key], undefined, key);
   assert.equal((await send(payload)).status, 200);
   assert.equal(providerCalls, 1);

   const optIn = await send(body(2, 'image', {model:'z-image-spicy',size:'1024x1024',prompt_extend:true}));
   assert.equal(optIn.status, 201);
   assert.equal(lastPayload.prompt_extend, true);
   const optInGeneration = (await optIn.json()).generation;
   const reuseResponse = await getReuse(optInGeneration.id);
   assert.equal(reuseResponse.status, 200);
   assert.equal((await reuseResponse.json()).reuse.parameters.prompt_extend, true);

   // The official example returns data[].url. Use a synthetic URL on an
   // already allowed host because its example does not name the CDN.
   const resultUrl = 'https://assets.siraya.ai/fixture.png';
   kindResult = {created:1792557768,data:[{url:resultUrl}]};
   downloadMime = 'image/png';
   const proResponse = await send(body(3, 'image', {model:'z-image-spicy-pro',size:'2560x2560'}));
   assert.equal(proResponse.status, 201);
   assert.equal((await proResponse.json()).generation.status, 'completed');
   assert.deepEqual(sourceFetches, [resultUrl]);
   assert.equal(lastPayload.model, 'z-image-spicy-pro');
   assert.equal(lastPayload.size, '2560x2560');
   assert.equal(lastPayload.prompt_extend, false);
   assert.equal(exactImageCalls, 3);
 });
 await test('Z-Image Spicy exact grants and adult checks fail before reservation or provider generation', async () => {
   const regular = body(1, 'image', {model:'z-image-spicy'});
   const pro = body(2, 'image', {model:'z-image-spicy-pro'});
   removedModels = ['z-image-spicy-pro'];
   assert.equal((await send(pro)).status, 400);
   adult = false;
   assert.equal((await send(regular)).status, 403);
   assert.equal(jobs.length, 0);
   assert.equal(providerCalls, 0);

   adult = true;
   assert.equal((await send(regular)).status, 201);
   adult = false;
   assert.equal((await send(regular)).status, 403);
   assert.equal(providerCalls, 1);
 });
 await test('Z-Image Spicy rejects references and unsupported parameter shapes before reading assets', async () => {
   for (const parameters of [
     {assetIds:[1]},
     {businessAssetIds:[uuid(20)]},
     {referenceGenerationIds:[uuid(21)]},
     {n:2},
     {size:'123x123'},
     {size:'2560x2560'},
     {prompt_extend:'true'},
   ]) {
     const response = await send(body(1, 'image', {model:'z-image-spicy', ...parameters}));
     assert.equal(response.status, 400, JSON.stringify(parameters));
   }
   assert.equal(businessUploadCalls + generatedReferenceCalls, 0);
   assert.equal(jobs.length, 0);
   assert.equal(providerCalls, 0);
 });
 await test('storage failure keeps recovery source private and GET retries no paid model',async()=>{blobReady=false;const response=await send(body(1,'image'));let json=await response.json();assert.equal(json.generation.status,'processing');assert.equal(json.generation.errorCode,'storage_unavailable');assert.equal(json.generation.images,undefined);blobReady=true;json=await (await get(jobs[0].id)).json();assert.equal(json.generation.status,'completed');assert.equal(providerCalls,1)});
 await test('text creation supports bounded own-key prompt and no consumer credits',async()=>{const response=await send(body(1,'text',{max_tokens:500,temperature:0.5}));const json=await response.json();assert.equal(json.generation.text,'A paper city unfolds.');assert.equal(lastPayload.messages[0].role,'user');assert.equal(lastPayload.prompt,undefined);assert.equal(lastPayload.max_tokens,500);assert.equal(uploads,0)});
 await test('text token cap/temperature and image count are strict',async()=>{for(const payload of [body(1,'text',{max_tokens:4097}),body(1,'text',{temperature:Infinity}),body(1,'image',{n:5}),body(1,'image',{n:1.2})])assert.equal((await send(payload)).status,400);assert.equal(providerCalls,0)});
 await test('video controls use declared duration/aspect/audio capability',async()=>{assert.equal((await send(body(1,'video',{model:'veo-3.1-generate-001',seconds:5}))).status,400);assert.equal((await send(body(1,'video',{model:'veo-3.1-generate-001',aspect_ratio:'1:1'}))).status,400);assert.equal(providerCalls,0)});
 await test('Kling business metadata and creation share strict official capabilities',async()=>{const response=await catalog.GET(new NextRequest('https://fixture.invalid/api/business/models'));const models=(await response.json()).models;assert.equal(models.filter(model=>model.id.startsWith('kling-')).length,6);assert.equal(models.find(model=>model.id==='kling-2.6').nativeAudioResolutions[0],'1080p');assert.equal(models.find(model=>model.id==='kling-3.0-turbo').nativeAudioOnly,true);for(const extra of [{model:'kling-2.6',resolution:'720p',generate_audio:true},{model:'kling-3.0-turbo',generate_audio:false},{model:'kling-o1',generate_audio:true},{model:'kling-3.0',seconds:6}])assert.equal((await send(body(1,'video',extra))).status,400);assert.equal(providerCalls,0);assert.equal((await send(body(2,'video',{model:'kling-3.0',seconds:10,resolution:'4k',generate_audio:true}))).status,201);assert.equal(lastPayload.model,'kling-3.0');assert.equal(seenKeys.at(-1),'sk-fixture-key-original')});
 await test('Kling regular reference is single first frame and Omni accepts up to four images',async()=>{assetRows=[1,2].map(id=>({id,user_id:7,content_type:'image/png',size:100}));assert.equal((await send(body(1,'video',{model:'kling-3.0',assetIds:[1,2]}))).status,400);assert.equal(providerCalls,0);assert.equal((await send(body(2,'video',{model:'kling-3.0-omni',assetIds:[1,2]}))).status,201);assert.equal(lastPayload.input_references.length,2)});
 await test('MiniMax H3 native audio and exact resolution metadata govern own-key creation',async()=>{const response=await catalog.GET(new NextRequest('https://fixture.invalid/api/business/models'));const models=(await response.json()).models;const h3=models.find(model=>model.id==='minimax-h3'),max=models.find(model=>model.id==='minimax-h3-max');assert.deepEqual(h3.resolutions,['768p','2k']);assert.deepEqual(max.resolutions,['480p','768p']);assert.equal(h3.minSeconds,4);assert.equal(max.minSeconds,5);assert.equal(h3.nativeAudioOnly,true);for(const parameters of [{model:'minimax-h3',seconds:3},{model:'minimax-h3-max',seconds:4},{model:'minimax-h3',resolution:'1080p'},{model:'minimax-h3',generate_audio:false},{model:'minimax-h3',seed:1}])assert.equal((await send(body(1,'video',parameters))).status,400);assert.equal(providerCalls,0);assert.equal((await send(body(2,'video',{model:'minimax-h3',seconds:7,resolution:'2k',generate_audio:true}))).status,201);assert.equal(lastPayload.seconds,7);assert.equal(lastPayload.resolution,'2k');assert.equal(seenKeys.at(-1),'sk-fixture-key-original')});
 await test('MiniMax M3 text model uses exact model and current user key',async()=>{const response=await send(body(1,'text',{model:'minimax-m3',max_tokens:1024}));assert.equal(response.status,201);assert.equal(lastPayload.model,'minimax-m3');assert.notEqual(lastPayload.model,'FW-MiniMax-M2.5');assert.equal(seenKeys[0],'sk-fixture-key-original');assert.equal((await response.json()).generation.kind,'text')});
 await test('MiniMax BYOK nine owned images survive resolver and stay within shared byte limits',async()=>{assetRows=Array.from({length:9},(_,index)=>({id:index+1,user_id:7,content_type:'image/png',size:2*1024*1024}));for(const [index,model]of ['minimax-h3','minimax-h3-max'].entries()){const response=await send(body(index+1,'video',{model,assetIds:assetRows.map(row=>row.id)}));assert.equal(response.status,201);assert.equal(lastPayload.input_references.length,9);}assetRows.forEach(asset=>asset.size=3*1024*1024);assert.equal((await send(body(3,'video',{model:'minimax-h3',assetIds:assetRows.map(row=>row.id)}))).status,400);assert.equal(providerCalls,2)});
 await test('Seedance expanded references do not widen the Kling image allowance',async()=>{assetRows=Array.from({length:9},(_,index)=>({id:index+1,user_id:7,content_type:'image/png',size:100}));assert.equal((await send(body(1,'video',{model:'SIRAYA-Seedance-2.5',assetIds:[1,2,3,4,5]}))).status,201);assert.equal(lastPayload.input_references.length,5);assert.equal((await send(body(2,'video',{model:'kling-3.0-omni',assetIds:[1,2,3,4,5]}))).status,400);assert.equal(providerCalls,1)});
 await test('Seedance metadata exposes exact shared quotas for standard and adult aliases',async()=>{const result=await(await catalog.GET(new NextRequest('https://fixture.invalid/api/business/models'))).json();for(const id of ['SIRAYA-Seedance-2.5','NSFW-SIRAYA-Seedance-2.5']){const model=result.models.find(m=>m.id===id);assert.deepEqual(model.seedance.references,{total:50,image:30,video:10,audio:10});assert.equal(model.aspectRatios.length,7);assert.equal(model.maxReferenceImages,30);assert.ok(model.seedance.modes.includes('video-edit'));}const old=result.models.find(m=>m.id==='SIRAYA-Seedance-2.0');assert.deepEqual(old.seedance.references,{total:15,image:9,video:3,audio:3});});
 await test('thirty owned Seedance images use private expiring URLs without a base64 aggregate cap',async()=>{assetRows=Array.from({length:30},(_,i)=>({id:i+1,user_id:7,content_type:'image/png',size:2*1024*1024}));const response=await send(body(1,'video',{assetIds:assetRows.map(a=>a.id)}));assert.equal(response.status,201);assert.equal(lastPayload.input_references.length,30);assert.equal(localReferenceCalls,1);assert.ok(lastPayload.input_references.every(ref=>ref.url.startsWith('https://fixture.invalid/api/business/references/')&&ref.role==='reference_image'));assert.equal(lastPayload.assetIds,undefined);assert.equal(lastPayload.referenceOrder,undefined);});
 await test('fifty mixed current-key registered materials retain their types and roles',async()=>{registeredAssets=[...Array.from({length:30},(_,i)=>({id:`img-${i}`,type:'image'})),...Array.from({length:10},(_,i)=>({id:`vid-${i}`,type:'video'})),...Array.from({length:10},(_,i)=>({id:`aud-${i}`,type:'audio'}))].map(asset=>({...asset,status:'active',apiKey:credentials.get(activeCredential)}));const providerAssets=registeredAssets.map(({id,type})=>({id,type}));assert.equal((await send(body(1,'video',{providerAssets,seconds:-1,mode:'subject-reference'}))).status,201);assert.equal(lastPayload.input_references.length,50);assert.equal(lastPayload.seconds,-1);assert.equal(providerReferenceCalls,1);assert.equal(lastPayload.providerAssets,undefined);assert.ok(lastPayload.input_references.every(ref=>ref.role===`reference_${ref.type}`));assert.equal(seenKeys.at(-1),'sk-fixture-key-original');});
 await test('N-Seedance 2.5 accepts thirty private uploads plus ten video and ten audio references in selection order',async()=>{
   businessUploads=Array.from({length:30},(_,i)=>uuid(100+i));
   const providerAssets=['video','audio'].flatMap(type=>Array.from({length:10},(_,i)=>({id:`${type}-${i}`,type})));
   registeredAssets=providerAssets.map(asset=>({...asset,status:'active',apiKey:credentials.get(activeCredential)}));
   const referenceOrder=[`provider:${providerAssets[0].id}`,...businessUploads.map(id=>`business:${id}`),...providerAssets.slice(1).map(asset=>`provider:${asset.id}`)];
   const response=await send(body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5',mode:'subject-reference',businessAssetIds:businessUploads,providerAssets,referenceOrder,seconds:-1}));
   assert.equal(response.status,201); assert.equal(lastPayload.input_references.length,50);
   assert.equal(lastPayload.input_references[0].type,'video'); assert.equal(lastPayload.input_references[30].type,'image'); assert.equal(lastPayload.input_references[49].type,'audio');
   assert.equal(businessUploadCalls,1); assert.equal(providerCalls,1);
 });
 await test('Seedance 2.5 accepts thirty completed workflow image sources, and rejects a thirty-first before source resolution',async()=>{
   generatedSources=Array.from({length:31},(_,i)=>uuid(100+i));
   assert.equal((await send(body(1,'video',{referenceGenerationIds:generatedSources.slice(0,30),mode:'subject-reference'}))).status,201);
   assert.equal(lastPayload.input_references.length,30); assert.equal(generatedReferenceCalls,1);
   assert.equal((await send(body(2,'video',{referenceGenerationIds:generatedSources,mode:'subject-reference'}))).status,400);
   assert.equal(generatedReferenceCalls,1); assert.equal(providerCalls,1);
 });
 await test('over-total and per-type reference limits reject before source lookups or job reservation',async()=>{const make=(type,n)=>Array.from({length:n},(_,i)=>({id:`${type}-${i}`,type}));for(const providerAssets of [make('image',31),make('video',11),make('audio',11),[...make('image',30),...make('video',10),...make('audio',11)]])assert.equal((await send(body(1,'video',{providerAssets,seconds:-1}))).status,400);assert.equal(providerReferenceCalls+localReferenceCalls+providerCalls,0);assert.equal(jobs.length,0);});
 await test('Seedance 2.0 supports fifteen mixed materials while fast and mini keep their resolution limits',async()=>{registeredAssets=[...Array.from({length:9},(_,i)=>({id:`img-${i}`,type:'image'})),...Array.from({length:3},(_,i)=>({id:`vid-${i}`,type:'video'})),...Array.from({length:3},(_,i)=>({id:`aud-${i}`,type:'audio'}))].map(asset=>({...asset,status:'active',apiKey:credentials.get(activeCredential)}));assert.equal((await send(body(1,'video',{model:'SIRAYA-Seedance-2.0',providerAssets:registeredAssets.map(({id,type})=>({id,type})),seconds:-1,resolution:'4k'}))).status,201);assert.equal(lastPayload.input_references.length,15);for(const model of ['SIRAYA-Seedance-2.0-fast','SIRAYA-Seedance-2.0-mini'])assert.equal((await send(body(2,'video',{model,resolution:'1080p'}))).status,400);assert.equal(providerCalls,1);});
 await test('mixed local/provider first-last frames honor explicit selection order and adaptive ratio',async()=>{assetRows=[{id:1,user_id:7,content_type:'image/png',size:100}];registeredAssets=[{id:'provider-first',type:'image',status:'active',apiKey:credentials.get(activeCredential)}];const response=await send(body(1,'video',{mode:'first-last-frame',assetIds:[1],providerAssets:[{id:'provider-first',type:'image'}],referenceOrder:['provider:provider-first','local:1'],output_format:'mov'}));assert.equal(response.status,201);assert.deepEqual(lastPayload.frame_images,[{frame_type:'first_frame',image_url:'asset://provider-first'},{frame_type:'last_frame',image_url:'https://fixture.invalid/api/business/references/opaque-1'}]);assert.equal(lastPayload.input_references,undefined);assert.equal(lastPayload.aspect_ratio,'adaptive');assert.equal(lastPayload.mode,undefined);assert.equal(lastPayload.referenceOrder,undefined);assert.equal(lastPayload.output_format,'mov');});
 await test('missing duplicate or foreign order keys cannot add drop or reorder unselected materials',async()=>{assetRows=[1,2].map(id=>({id,user_id:7,content_type:'image/png',size:100}));for(const referenceOrder of [['local:1'],['local:1','local:1'],['local:1','local:3']])assert.equal((await send(body(1,'video',{mode:'first-last-frame',assetIds:[1,2],referenceOrder}))).status,400);assert.equal(localReferenceCalls+providerReferenceCalls+providerCalls,0);assert.equal(jobs.length,0);});
 await test('Seedance modes validate text image first-last subject edit and extend without passthrough fields',async()=>{assetRows=[1,2].map(id=>({id,user_id:7,content_type:'image/png',size:100}));registeredAssets=[{id:'owned-video',type:'video',status:'active',apiKey:credentials.get(activeCredential)}];kindResult={output_url:'https://example.volces.com/own.mp4'};const cases=[{mode:'text-to-video'},{mode:'image-to-video',assetIds:[1]},{mode:'first-last-frame',assetIds:[1,2]},{mode:'subject-reference',assetIds:[1]},{mode:'video-edit',providerAssets:[{id:'owned-video',type:'video'}],seconds:-1},{mode:'video-extend',providerAssets:[{id:'owned-video',type:'video'}],seconds:-1}];for(const [i,parameters]of cases.entries()){assert.equal((await send(body(i+1,'video',parameters))).status,201);assert.equal(lastPayload.mode,undefined);assert.equal(lastPayload.task_type,undefined);if(parameters.mode==='image-to-video')assert.deepEqual(lastPayload.frame_images,[{frame_type:'first_frame',image_url:'https://fixture.invalid/api/business/references/opaque-1'}]);if(parameters.mode==='video-edit')assert.match(lastPayload.prompt,/^Video edit: /);if(parameters.mode==='video-extend')assert.match(lastPayload.prompt,/^Video extension: /);}assert.equal(providerCalls,6);});
 await test('unreviewed controls malformed assets or a fixed duration video fail before reads',async()=>{for(const extra of [{negative_prompt:'unsupported'},{camera_fixed:true},{providerAssets:[{id:'https://evil.invalid/a',type:'image'}]},{providerAssets:[{id:'owned',type:'image',url:'https://evil.invalid'}]},{providerAssets:[{id:'owned',type:'image'},{id:'owned',type:'image'}]},{providerAssets:[{id:'owned',type:'video'}],seconds:8},{mode:'text-to-video',assetIds:[1]}])assert.equal((await send(body(1,'video',extra))).status,400);assert.equal(localReferenceCalls+providerReferenceCalls+providerCalls,0);assert.equal(jobs.length,0);});
 await test('unavailable current-key registered material fails preflight and can be corrected without a paid reservation',async()=>{assert.equal((await send(body(1,'video',{providerAssets:[{id:'foreign-image',type:'image'}]}))).status,400);assert.equal(providerCalls,0);assert.equal(jobs.length,0);registeredAssets=[{id:'foreign-image',type:'image',status:'active',apiKey:credentials.get(activeCredential)}];assert.equal((await send(body(1,'video',{providerAssets:[{id:'foreign-image',type:'image'}]}))).status,201);assert.equal(providerCalls,1);});
 await test('MOV provider output is preserved with a private .mov URL',async()=>{downloadMime='video/quicktime';kindResult={output_url:'https://example.volces.com/own.mov'};const response=await send(body(1,'video',{output_format:'mov'}));const generation=(await response.json()).generation;assert.equal(generation.status,'completed');assert.match(generation.videoUrl,/\.mov$/);assert.equal(uploads,1);});
 await test('HTTP receipt is distinct from a model task and remains available on replay',async()=>{const response=await send();const generation=(await response.json()).generation;assert.equal(generation.providerRequestId,'fixture-provider-request');assert.equal(generation.providerHttpStatus,200);assert.notEqual(generation.providerRequestId,'provider-owned-job');assert.equal(generation.provider_task_id,undefined);assert.ok(generation.submittedAt);assert.equal(generation.completedAt,null);assert.equal(generation.durationMs,null);assert.equal(generation.providerCost,null);assert.equal(generation.billingStatus,'pending');assert.deepEqual(jobs[0].provider_request_ids,['fixture-provider-request']);assert.equal(jobs[0].provider_receipt_count,1);assert.equal((await(await send()).json()).generation.providerRequestId,'fixture-provider-request');assert.equal(providerCalls,1);});
 await test('observed completion timing is first-terminal, while provider latency remains unknown',async()=>{await send();pollVideo={status:'completed',output_url:'https://example.volces.com/own.mp4'};const first=(await(await get(jobs[0].id)).json()).generation;assert.ok(first.completedAt);assert.ok(Number.isSafeInteger(first.durationMs)&&first.durationMs>=0);assert.equal(first.providerDurationMs,null);const repeated=(await(await get(jobs[0].id)).json()).generation;assert.equal(repeated.completedAt,first.completedAt);assert.equal(repeated.durationMs,first.durationMs);assert.equal(providerCalls,1);});
 await test('explicit HTTP rejection captures receipt and terminal duration but network uncertainty never fabricates one',async()=>{failProvider=new SirayaApiError(402,'quota');let generation=(await(await send()).json()).generation;assert.equal(generation.providerRequestId,'fixture-provider-request');assert.equal(generation.providerHttpStatus,402);assert.ok(generation.completedAt);assert.ok(generation.durationMs>=0);failProvider=new TypeError('network');generation=(await(await send(body(2))).json()).generation;assert.equal(generation.providerRequestId,null);assert.equal(generation.providerHttpStatus,null);assert.equal(generation.completedAt,null);assert.equal(generation.durationMs,null);assert.equal(generation.billingStatus,'pending');});
 await test('transient receipt writer failure preserves accepted task and heals during durable status update',async()=>{metadataWriteFails=true;const generation=(await(await send()).json()).generation;assert.equal(generation.status,'processing');assert.equal(generation.providerRequestId,'fixture-provider-request');assert.equal(generation.providerHttpStatus,200);assert.equal(providerCalls,1);assert.deepEqual(jobs[0].provider_request_ids,['fixture-provider-request']);assert.equal(jobs[0].provider_receipt_count,1);});
 await test('owned opaque job ID is the only polling input; foreign user is denied',async()=>{await send();const row=jobs[0];row.user_id=99;assert.equal((await get(row.id)).status,404);assert.equal((await get('provider-owned-job')).status,404);assert.equal(lookupCalls,1)});
 await test('key rotation preserves pinned original key for pending job poll',async()=>{await send();activeCredential='22222222-2222-4222-8222-222222222222';credentials.set(activeCredential,'sk-fixture-key-rotated');await get(jobs[0].id);assert.deepEqual(seenKeys,['sk-fixture-key-original','sk-fixture-key-original','sk-fixture-key-original']);assert.equal(providerCalls,1)});
 await test('key rotation between key lookup and reservation rejects new use of retired key',async()=>{rotateDuringReservation=true;const response=await send();assert.equal(response.status,409);assert.equal((await response.json()).error.code,'credential_changed');assert.equal(providerCalls,0);assert.equal(jobs.length,0)});
 await test('revoked pinned key blocks lookup and does not fall back',async()=>{await send();revoked=true;const response=await get(jobs[0].id);assert.equal((await response.json()).generation.errorCode,'credential_missing');assert.equal(lookupCalls,1)});
 await test('completed video is persisted privately and repeated reads do not call vendor',async()=>{await send();pollVideo={status:'succeeded',output_url:'https://example.volces.com/own.mp4'};let json=await (await get(jobs[0].id)).json();assert.equal(json.generation.status,'completed');assert.match(json.generation.videoUrl,/^\/api\/business\/media\//);await get(jobs[0].id);assert.equal(lookupCalls,2);assert.equal(uploads,1);assert.equal(providerCalls,1)});
 await test('completed-without-video is failure, no endless polling or extra paid call',async()=>{await send();pollVideo={status:'completed'};const response=await get(jobs[0].id);assert.equal((await response.json()).generation.errorCode,'result_missing');await get(jobs[0].id);assert.equal(lookupCalls,2);assert.equal(providerCalls,1)});
 await test('Wan 3.0 Spicy video accepts the exact signed CDN and skips an invalid earlier result URL', async () => {
   for (const [index, model] of wanSpicyModels.entries()) {
     const url = `https://usercontent1.carrothub.ai/results/${index}.mp4?signature=fixture`;
     kindResult = { output_url: index === 0 ? url : 'https://untrusted.invalid/result.mp4', data: [{ url }] };
     const result = (await (await send(body(index+1, 'video', { model }))).json()).generation;
     assert.equal(result.status, 'completed', model);
     assert.match(result.videoUrl, /^\/api\/business\/media\/[^/]+\/adult\//);
     assert.equal(sourceFetches[index], url);
     assert.ok(!JSON.stringify(result).includes('carrothub.ai'));
   }
   assert.equal(uploads, wanSpicyModels.length);
 });
 await test('the Wan CDN cannot be used by other models, images, spoofed hosts, HTTP or custom ports', async () => {
   const url = 'https://usercontent1.carrothub.ai/results/fixture.mp4';
   const requests = [
     ['video', 'wan3.0-video-pro', url],
     ['video', 'NSFW-SIRAYA-Seedance-2.5', url],
     ['image', 'NSFW-Dola-Seedream-5.0-pro', url],
     ...[
       'http://usercontent1.carrothub.ai/a.mp4',
       'https://usercontent1.carrothub.ai.evil.invalid/a.mp4',
       'https://other.usercontent1.carrothub.ai/a.mp4',
       'https://usercontent2.carrothub.ai/a.mp4',
       'https://user:pass@usercontent1.carrothub.ai/a.mp4',
       'https://usercontent1.carrothub.ai:8443/a.mp4',
     ].map(source => ['video', 'wan3.0-video-prime-pro-spicy', source]),
   ];
   for (const [index, [kind, model, source]] of requests.entries()) {
     kindResult = kind === 'video' ? { id: 'provider-owned-job', output_url: source } : { data: [{ url: source }] };
     const response = await send(body(index+1, kind, { model }));
     assert.equal(response.status, 201, `${model} ${source}`);
     const { generation } = await response.json();
     if (kind === 'video') {
       assert.equal(generation.status, 'processing');
       pollVideo = { status: 'completed', output_url: source };
       assert.equal((await (await get(generation.id)).json()).generation.errorCode, 'result_missing');
     } else assert.equal(generation.errorCode, 'result_missing');
     assert.equal(sourceFetches.length, 0, `${model} ${source}`);
   }
   assert.equal(uploads, 0);
 });
 await test('manual Wan recovery is owner-only, requires age and the original key, and never resubmits', async () => {
   await send(body(1, 'video', { model: 'wan3.0-video-prime-pro-spicy' }));
   const job = jobs[0];
   pollVideo = { status: 'completed' };
   const failed = (await (await get(job.id)).json()).generation;
   assert.equal(failed.errorCode, 'result_missing');
   pollVideo = { status: 'completed', output_url: 'https://usercontent1.carrothub.ai/results/fixture.mp4' };
   for (const query of ['', '?recheck=0', '?recheck=true']) {
     assert.equal((await (await get(job.id, query)).json()).generation.errorCode, 'result_missing');
   }
   for (const headers of [{'sec-fetch-site':'cross-site'}, {'sec-fetch-site':'same-site'}, {origin:'https://untrusted.invalid'}]) {
     assert.equal((await get(job.id, '?recheck=1', headers)).status, 403);
   }
   adult = false;
   assert.equal((await get(job.id, '?recheck=1')).status, 403);
   adult = true;
   approval = false;
   assert.equal((await get(job.id, '?recheck=1')).status, 403);
   approval = true;
   job.user_id = 8;
   assert.equal((await get(job.id, '?recheck=1')).status, 404);
   job.user_id = 7;
   revoked = true;
   assert.equal((await (await get(job.id, '?recheck=1')).json()).generation.errorCode, 'result_missing');
   revoked = false;
   assert.equal(lookupCalls, 2);
   activeCredential = '22222222-2222-4222-8222-222222222222';
   credentials.set(activeCredential, 'sk-fixture-key-rotated');
   const responses = await Promise.all([get(job.id, '?recheck=1'), get(job.id, '?recheck=1')]);
   const recovered = (await Promise.all(responses.map(response => response.json()))).map(item => item.generation).find(item => item.status === 'completed');
   assert.ok(recovered);
   assert.match(recovered.videoUrl, /^\/api\/business\/media\/[^/]+\/adult\//);
   assert.equal(recovered.completedAt, failed.completedAt);
   await get(job.id, '?recheck=1');
   assert.equal(lookupCalls, 3);
   assert.equal(seenKeys.at(-1), 'sk-fixture-key-original');
   assert.equal(providerCalls, 1);
   assert.equal(uploads, 1);
 });
 await test('recheck does not reactivate other failed tasks', async () => {
   await send();
   pollVideo = { status: 'completed' };
   const id = jobs[0].id;
   assert.equal((await (await get(id)).json()).generation.errorCode, 'result_missing');
   assert.equal((await (await get(id, '?recheck=1')).json()).generation.errorCode, 'result_missing');
   assert.equal(lookupCalls, 2);
   assert.equal(providerCalls, 1);
 });
 await test('structured content policy codes classify POST and async rejection without exposing provider text', async () => {
   const code = 'OutputVideoSensitiveContentDetected';
   const model = 'NSFW-SIRAYA-Seedance-2.5';
   const message = 'fixture internal provider reason';
   failProvider = new SirayaApiError(400, message, 'BadRequest', `${code}.PolicyViolation`);
   const rejected = (await (await send(body(1, 'video', { model }))).json()).generation;
   assert.equal(rejected.errorCode, 'provider_content_policy');
   assert.equal(rejected.providerHttpStatus, 400);
   assert.ok(!JSON.stringify(rejected).includes(message));
   failProvider = null;
   kindResult = { error: { type: code, message } };
   assert.equal((await (await send(body(2, 'video', { model }))).json()).generation.errorCode, 'provider_content_policy');
   kindResult = null;
   await send(body(3, 'video', { model }));
   pollVideo = { status: 'failed', error: { code: `${code}.PolicyViolation`, message } };
   const failed = (await (await get(jobs[2].id)).json()).generation;
   assert.equal(failed.errorCode, 'provider_content_policy');
   assert.equal(failed.providerHttpStatus, 200);
   assert.ok(!JSON.stringify(failed).includes(message));
   await send(body(4, 'video', { model }));
   pollVideo = new SirayaApiError(400, message, 'BadRequest', code);
   assert.equal((await (await get(jobs[3].id)).json()).generation.errorCode, 'provider_content_policy');
   failProvider = new SirayaApiError(400, `${message} ${code}`, 'BadRequest', 'InvalidParameter');
   assert.equal((await (await send(body(5, 'video', { model }))).json()).generation.errorCode, 'provider_rejected');
   failProvider = null;
   await send(body(6, 'video', { model }));
   pollVideo = { status: 'failed', error: { code: `${code}.Unverified`, message: code } };
   assert.equal((await (await get(jobs[5].id)).json()).generation.errorCode, 'provider_failed');
   failProvider = new SirayaApiError(400, message, 'content_policy_violation');
   assert.equal((await (await send(body(7, 'video', { model }))).json()).generation.errorCode, 'provider_content_policy');
 });
 await test('parallel poll reconciles at most once and never duplicates media upload',async()=>{await send();pollVideo={status:'completed',output_url:'https://example.volces.com/own.mp4'};await Promise.all([get(jobs[0].id),get(jobs[0].id),get(jobs[0].id)]);assert.equal(lookupCalls,2);assert.equal(uploads,1)});
 await test('malicious private-network or arbitrary provider output URL never fetched',async()=>{kindResult={data:[{url:'http://127.0.0.1/secrets'}]};const response=await send(body(1,'image'));assert.equal((await response.json()).generation.errorCode,'result_missing');assert.equal(uploads,0)});
 await test('documented Kling and MiniMax media origins are privately persisted',async()=>{for(const [index,url] of ['https://v16-kling.klingai.com/fixture.mp4','https://cdn.hailuoai.com/fixture.mp4','https://filecdn.minimax.chat/fixture.mp4'].entries()){kindResult={data:[{url}]};const response=await send(body(index+1));assert.equal((await response.json()).generation.status,'completed');assert.equal(sourceFetches[index],url);}assert.equal(uploads,3)});
 await test('new vendor host rules reject spoofed hosts, IPs, credentials, HTTP and custom ports',async()=>{for(const url of ['http://cdn.hailuoai.com/fixture.mp4','https://127.0.0.1/private','https://[::1]/private','https://cdn.hailuoai.com.evil.invalid/fixture.mp4','https://unknown.cdn.hailuoai.com/fixture.mp4','https://klingai.com.evil.invalid/fixture.mp4','https://cdn.hailuoai.com:8443/fixture.mp4','https://user:secret@v1.klingai.com/fixture.mp4','https://untrusted.invalid/fixture.mp4']){reset();kindResult={data:[{url}]};await send();assert.equal(sourceFetches.length,0,url);assert.equal(uploads,0)}});
 await test('approved media origin cannot redirect a download to a private address',async()=>{downloadRedirect=true;kindResult={data:[{url:'https://cdn.hailuoai.com/redirect.mp4'}]};const response=await send();const job=(await response.json()).generation;assert.equal(job.status,'processing');assert.equal(job.errorCode,'storage_unavailable');assert.deepEqual(sourceFetches,['https://cdn.hailuoai.com/redirect.mp4']);assert.equal(uploads,0);assert.equal(providerCalls,1)});
 await test('fresh own-key grants are required for each new paid job, while durable replay survives catalog changes',async()=>{removedModels=['SIRAYA-Seedance-2.5'];let response=await send();assert.equal(response.status,400);assert.equal(jobs.length,0);assert.equal(providerCalls,0);removedModels=[];await send();removedModels=['SIRAYA-Seedance-2.5'];response=await send();assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);assert.equal(providerCalls,1);assert.equal(lookupCalls,2)});
 await test('catalog outage is known preflight and does not lock a UUID or fallback to platform credentials',async()=>{catalogFailure=true;const response=await send();assert.equal(response.status,502);assert.equal((await response.json()).error.code,'credential_validation_failed');assert.equal(providerCalls,0);assert.equal(jobs.length,0);catalogFailure=false;assert.equal((await send()).status,201);assert.equal(providerCalls,1)});
 await test('new text families use their exact granted ID without retail aliases',async()=>{for(const [i,model]of ['claude-opus-5.5','gpt-6.1','qwen3.8-max','kimi-k3','deepseek-v4-flash'].entries()){assert.equal((await send(body(i+1,'text',{model}))).status,201);assert.equal(lastPayload.model,model);assert.equal(lastPayload.max_tokens,1024)}assert.equal(providerCalls,5)});
 await test('regular image IDs retain version-correct defaults and no retail rate dependency', async () => {
   const separateContracts = new Set(['retired-image', 'z-image-spicy', 'z-image-spicy-pro']);
   const imageIds = models.filter(([id,kind]) => kind === 'image' && !separateContracts.has(id)).map(([id]) => id);
   for (const [i,model] of imageIds.entries()) {
     assert.equal((await send(body(i+1, 'image', {model}))).status, 201, model);
     assert.equal(lastPayload.model, model);
     assert.equal(lastPayload.n, 1);
     if (/Seedream/i.test(model)) assert.equal(lastPayload.sequential_image_generation, 'disabled');
   }
   assert.equal(providerCalls, imageIds.length);
 });
 await test('image batch and quality contracts reject incompatible choices before reservation',async()=>{for(const extra of [{model:'gemini-3.1-flash-image',n:2},{model:'Dola-Seedream-5.0-lite',n:2},{model:'gpt-image-2',n:11},{model:'gpt-image-2',quality:'max'},{model:'gemini-3.1-flash-lite-image',size:'2048x2048'},{model:'Dola-Seedream-5.0-pro',seed:1},{model:'ByteDance-Seedream-4.5',negative_prompt:'unverified'},{model:'gpt-image-2',seed:1},{model:'gemini-3-pro-image',quality:'high'}])assert.equal((await send(body(1,'image',extra))).status,400,JSON.stringify(extra));assert.equal(jobs.length,0);assert.equal(providerCalls,0);assert.equal((await send(body(1,'image',{model:'gpt-image-2.5-flare',quality:'max',n:10,size:'3840x2160'}))).status,201);assert.equal(lastPayload.n,10);assert.equal(lastPayload.quality,'max');assert.equal((await send(body(2,'image',{model:'gemini-3.1-flash-image',seed:123,size:'512x512'}))).status,201);assert.equal(lastPayload.seed,123)});
 await test('native B uploads resolve HTTPS sources only under the current account and credential',async()=>{businessUploads=[uuid(20),uuid(21)];assert.equal((await send(body(1,'image',{model:'gpt-image-2.5-sunburst',businessAssetIds:businessUploads}))).status,201);assert.equal(businessUploadCalls,1);assert.equal(lastPayload.businessAssetIds,undefined);assert.ok(lastPayload.image.every(url=>url.startsWith('https://fixture.invalid/api/business/provider-assets/source/')));assert.ok(lastPayload.image.every(url=>!url.startsWith('asset://')));assert.equal((await send(body(2,'image',{businessAssetIds:[uuid(99)]}))).status,400);assert.equal(providerCalls,1);assert.equal(jobs.length,1)});
 await test('combined native B and legacy references honor each exact image-family cap',async()=>{assetRows=Array.from({length:10},(_,i)=>({id:i+1,user_id:7,content_type:'image/png',size:100}));businessUploads=Array.from({length:16},(_,i)=>uuid(100+i));for(const extra of [{model:'Dola-Seedream-5.0-pro',assetIds:[1],businessAssetIds:businessUploads.slice(0,10)},{model:'gemini-3.1-flash-image',assetIds:[1],businessAssetIds:businessUploads.slice(0,14)},{model:'gpt-image-2',assetIds:[1],businessAssetIds:businessUploads}])assert.equal((await send(body(1,'image',extra))).status,400);assert.equal(providerCalls,0);assert.equal(businessUploadCalls,0);assert.equal(jobs.length,0);for(const [i,extra]of [{model:'Dola-Seedream-5.0-pro',businessAssetIds:businessUploads.slice(0,10)},{model:'gemini-3.1-flash-image',businessAssetIds:businessUploads.slice(0,14)},{model:'gpt-image-2',businessAssetIds:businessUploads}].entries())assert.equal((await send(body(i+1,'image',extra))).status,201);assert.equal(providerCalls,3)});
 await test('dedicated Wan2.7 and Happy1.1 models use uppercase provider contracts and native B source images',async()=>{businessUploads=Array.from({length:9},(_,i)=>uuid(100+i));kindResult={output_url:'https://example.volces.com/own.mp4'};for(const [i,model]of ['wan2.7-t2v','wan2.7-i2v','wan2.7-r2v','happyhorse-1.1-t2v','happyhorse-1.1-i2v','happyhorse-1.1-r2v'].entries()){const count=model.endsWith('t2v')?0:model.endsWith('i2v')?1:3;const response=await send(body(i+1,'video',{model,...count?{businessAssetIds:businessUploads.slice(0,count)}:{}}));assert.equal(response.status,201,model);assert.equal(lastPayload.resolution,'720P');assert.equal(lastPayload.watermark,false);assert.equal(lastPayload.businessAssetIds,undefined);assert.equal(lastPayload.mode,undefined);assert.equal(lastPayload.extra_body,undefined);if(model.endsWith('i2v')){assert.equal(lastPayload.frame_images.length,1);assert.equal(lastPayload.aspect_ratio,undefined)}if(model.endsWith('r2v'))assert.ok(lastPayload.input_references.every(ref=>ref.role==='reference_image'&&ref.url.startsWith('https://fixture.invalid/')))}assert.equal(providerCalls,6)});
 await test('Wan Spicy image-to-video preserves mixed source order and exact wire schemas by version', async () => {
   const originalId = uuid(219), generatedId = uuid(220);
   businessUploads = [originalId];
   generatedSources = [generatedId];
   kindResult = {output_url:'https://example.volces.com/own.mp4'};
   const first = `https://fixture.invalid/api/business/generated-references/opaque-${generatedId}`;
   const last = `https://fixture.invalid/api/business/provider-assets/source/opaque-${originalId}`;
   const inputs = {
     businessAssetIds:[originalId], referenceGenerationIds:[generatedId],
     referenceOrder:[`generated:${generatedId}`, `business:${originalId}`], mode:'first-last-frame',
   };
   for (const [index,model] of ['wan2.2-i2v-spicy','wan2.7-i2v-spicy'].entries()) {
     const old = index === 0;
     const parameters = {...inputs, model, ...(old ? {seconds:8,resolution:'720p'} : {seconds:15,generate_audio:true})};
     const response = await send(body(index+1, 'video', parameters));
     assert.equal(response.status, 201);
     const { generation } = await response.json();
     assert.equal(generation.status, 'completed');
     assert.match(generation.videoUrl, /\/adult\//);
     assert.equal(lastPayload.model, model);
     assert.equal(lastPayload.resolution, old ? '720p' : '1080P');
     assert.equal(lastPayload.seconds, old ? 8 : 15);
     assert.equal(lastPayload.prompt_extend, false);
     assert.equal(lastPayload.input_references, undefined);
     assert.equal(lastPayload.referenceOrder, undefined);
     assert.equal(lastPayload.aspect_ratio, undefined);
     if (old) {
       assert.equal(lastPayload.image, first);
       assert.equal(lastPayload.last_image, last);
       assert.equal(lastPayload.frame_images, undefined);
       assert.equal(lastPayload.generate_audio, undefined);
     } else {
       assert.deepEqual(lastPayload.frame_images, [
         {frame_type:'first_frame',image_url:first}, {frame_type:'last_frame',image_url:last},
       ]);
       assert.equal(lastPayload.image, undefined);
       assert.equal(lastPayload.generate_audio, true);
     }
   }
   assert.equal(providerCalls, 2);
   assert.equal(businessUploadCalls, 2);
   assert.equal(generatedReferenceCalls, 2);
 });
 await test('Wan Spicy rejects age, wrong duration, model fields and non-image references before reading private media', async () => {
   const model = 'wan2.2-i2v-spicy', originalId = uuid(230);
   businessUploads = [originalId];
   adult = false;
   assert.equal((await send(body(1, 'video', {model,businessAssetIds:[originalId]}))).status, 403);
   adult = true;
   for (const extra of [
     {seconds:6}, {generate_audio:true}, {watermark:true}, {resolution:'1080p'},
     {referenceOrder:[`business:${uuid(999)}`]},
     {model:'wan2.7-i2v-spicy',providerAssets:[{id:'some-audio',type:'audio'}]},
     {model:'wan2.7-i2v-spicy',mode:'video-extend'},
   ]) {
     const response = await send(body(1, 'video', {model,businessAssetIds:[originalId],...extra}));
     assert.equal(response.status, 400, JSON.stringify(extra));
   }
   assert.equal(providerCalls, 0);
   assert.equal(jobs.length, 0);
   assert.equal(businessUploadCalls + generatedReferenceCalls + providerReferenceCalls, 0);
 });
 await test('dedicated references cannot use foreign asset IDs, unsupported sources or silent source-video editing',async()=>{businessUploads=Array.from({length:10},(_,i)=>uuid(200+i));for(const extra of [{model:'wan2.7-i2v'},{model:'happyhorse-1.1-i2v',businessAssetIds:businessUploads.slice(0,2)},{model:'wan2.7-r2v',businessAssetIds:businessUploads.slice(0,6)},{model:'happyhorse-1.1-r2v',businessAssetIds:businessUploads},{model:'happyhorse-1.1-r2v',assetIds:[1]},{model:'wan2.7-i2v',providerAssets:[{id:'owned',type:'image'}]},{model:'wan2.7-videoedit',businessAssetIds:businessUploads.slice(0,1)},{model:'wan2.7-i2v',businessAssetIds:businessUploads.slice(0,1),output_format:'mov'}])assert.equal((await send(body(1,'video',extra))).status,400,JSON.stringify(extra));assert.equal(providerCalls,0);assert.equal(jobs.length,0);assert.equal(businessUploadCalls,0)});
 await test('Wan2.7 first-last images retain ordered frames and Happyhorse prompt constraints reject before reservation',async()=>{businessUploads=[uuid(30),uuid(31)];assert.equal((await send(body(1,'video',{model:'wan2.7-i2v',mode:'first-last-frame',businessAssetIds:businessUploads,seed:5,negative_prompt:'low contrast'}))).status,201);assert.deepEqual(lastPayload.frame_images.map(ref=>ref.frame_type),['first_frame','last_frame']);assert.equal(lastPayload.frame_images[0].image_url.endsWith(uuid(30)),true);assert.equal(lastPayload.frame_images[1].image_url.endsWith(uuid(31)),true);assert.equal(lastPayload.seed,5);assert.equal(lastPayload.negative_prompt,'low contrast');for(const extra of [{model:'happyhorse-1.1-t2v',seed:-1},{model:'happyhorse-1.1-t2v',generate_audio:true},{model:'happyhorse-1.1-t2v',prompt:'語'.repeat(2501)},{model:'happyhorse-1.1-t2v',prompt:'a'.repeat(5001)},{model:'wan2.7-t2v',seconds:16}])assert.equal((await send(body(2,'video',extra))).status,400);assert.equal(providerCalls,1)});
 await test('completed B image job references reach all image families through owned HTTPS grants without ID passthrough',async()=>{generatedSources=[uuid(500)];for(const [i,model]of['gpt-image-2.5-sunburst','gemini-3.1-flash-image','Dola-Seedream-5.0-pro'].entries()){assert.equal((await send(body(i+1,'image',{model,referenceGenerationIds:generatedSources}))).status,201);assert.match(lastPayload.image,/^https:\/\/fixture.invalid\/api\/business\/generated-references\//);assert.equal(lastPayload.referenceGenerationIds,undefined);}assert.equal(generatedReferenceCalls,3);assert.equal(providerCalls,3);});
 await test('Seedance2.0 and2.5 receive generated or B-native first frames and retain their adaptive contract',async()=>{generatedSources=[uuid(500)];businessUploads=[uuid(600)];for(const [i,model]of['SIRAYA-Seedance-2.0','SIRAYA-Seedance-2.5'].entries()){assert.equal((await send(body(i+1,'video',{model,mode:'image-to-video',referenceGenerationIds:generatedSources}))).status,201);assert.equal(lastPayload.frame_images.length,1);assert.equal(lastPayload.frame_images[0].frame_type,'first_frame');assert.match(lastPayload.frame_images[0].image_url,/generated-references/);assert.equal(lastPayload.referenceGenerationIds,undefined);assert.equal(lastPayload.aspect_ratio,i===1?'adaptive':'16:9');}assert.equal((await send(body(3,'video',{model:'SIRAYA-Seedance-2.5',mode:'image-to-video',businessAssetIds:businessUploads}))).status,201);assert.match(lastPayload.frame_images[0].image_url,/provider-assets\/source/);assert.equal(lastPayload.businessAssetIds,undefined);});
 await test('Seedance point-to-point source order joins legacy, B original, generated and provider refs without silent omission',async()=>{assetRows=[{id:1,user_id:7,content_type:'image/png',size:100}];businessUploads=[uuid(600)];generatedSources=[uuid(500)];registeredAssets=[{id:'asset-owned',type:'image',status:'active',apiKey:credentials.get(activeCredential)}];const extra={mode:'subject-reference',assetIds:[1],businessAssetIds:businessUploads,referenceGenerationIds:generatedSources,providerAssets:[{id:'asset-owned',type:'image'}],referenceOrder:[`generated:${uuid(500)}`,'provider:asset-owned','local:1',`business:${uuid(600)}`]};assert.equal((await send(body(1,'video',extra))).status,201);assert.equal(lastPayload.input_references.length,4);assert.match(lastPayload.input_references[0].url,/generated-references/);assert.equal(lastPayload.input_references[1].url,'asset://asset-owned');assert.match(lastPayload.input_references[2].url,/\/references\//);assert.match(lastPayload.input_references[3].url,/provider-assets\/source/);assert.ok(lastPayload.input_references.every(ref=>ref.role==='reference_image'));});
 await test('combined workflow reference counts enforce image/Seedance/dedicated caps before private reads or reservation',async()=>{generatedSources=Array.from({length:16},(_,i)=>uuid(500+i));businessUploads=Array.from({length:16},(_,i)=>uuid(600+i));for(const extra of[{kind:'image',model:'gpt-image-2',referenceGenerationIds:generatedSources,businessAssetIds:businessUploads.slice(0,1)},{kind:'video',model:'SIRAYA-Seedance-2.0',mode:'subject-reference',referenceGenerationIds:generatedSources.slice(0,9),businessAssetIds:businessUploads.slice(0,1)},{kind:'video',model:'happyhorse-1.1-r2v',referenceGenerationIds:generatedSources.slice(0,9),businessAssetIds:businessUploads.slice(0,1)},{kind:'video',model:'SIRAYA-Seedance-2.5',mode:'subject-reference',referenceGenerationIds:generatedSources,businessAssetIds:businessUploads}]){const {kind,...parameters}=extra;assert.equal((await send(body(1,kind,parameters))).status,400);}assert.equal(generatedReferenceCalls+businessUploadCalls+providerCalls,0);assert.equal(jobs.length,0);});
 await test('dedicated Wan/Happy image-to-video and subject references consume generated jobs through their exact adapters',async()=>{generatedSources=[uuid(500)];kindResult={output_url:'https://example.volces.com/own.mp4'};for(const [i,model]of['wan2.7-i2v','wan2.7-r2v','happyhorse-1.1-i2v','happyhorse-1.1-r2v'].entries()){assert.equal((await send(body(i+1,'video',{model,referenceGenerationIds:generatedSources}))).status,201);const url=model.endsWith('i2v')?lastPayload.frame_images[0].image_url:lastPayload.input_references[0].url;assert.match(url,/generated-references/);assert.equal(lastPayload.referenceGenerationIds,undefined);assert.equal(lastPayload.businessAssetIds,undefined);}assert.equal(generatedReferenceCalls,4);});
 await test('foreign/unfinished generated IDs, duplicates, unsupported generic video and malformed source orders fail before paid submission',async()=>{generatedSources=[uuid(500)];for(const extra of[{referenceGenerationIds:[uuid(999)]},{referenceGenerationIds:[uuid(500),uuid(500)]},{model:'veo-3.1-generate-001',referenceGenerationIds:generatedSources},{model:'kling-3.0',referenceGenerationIds:generatedSources},{referenceGenerationIds:generatedSources,referenceOrder:[]},{referenceGenerationIds:generatedSources,referenceOrder:[`generated:${uuid(999)}`]}])assert.equal((await send(body(1,'video',extra))).status,400,JSON.stringify(extra));assert.equal(providerCalls,0);assert.equal(jobs.length,0);assert.equal((await send(body(1,'text',{referenceGenerationIds:generatedSources}))).status,400);});
 await test('generated first/last order is exact and duplicated client replay never remints references or invokes a second paid call',async()=>{generatedSources=[uuid(500),uuid(501)];const parameters={mode:'first-last-frame',referenceGenerationIds:generatedSources,referenceOrder:[`generated:${uuid(501)}`,`generated:${uuid(500)}`]};assert.equal((await send(body(1,'video',parameters))).status,201);assert.equal(lastPayload.frame_images[0].image_url.endsWith(uuid(501)),true);assert.equal(lastPayload.frame_images[1].image_url.endsWith(uuid(500)),true);assert.equal((await send(body(1,'video',parameters))).status,200);assert.equal(providerCalls,1);assert.equal(generatedReferenceCalls,1);});
 await test('reuse returns verified settings and original mixed order after asynchronous completion', async () => {
   assetRows=[{id:1,user_id:7,content_type:'image/png',size:100}];
   businessUploads=[uuid(600)]; generatedSources=[uuid(500)];
   registeredAssets=[{id:'character',type:'image',status:'active',apiKey:credentials.get(activeCredential)}];
   const referenceOrder=[`generated:${uuid(500)}`,'provider:character','local:1',`business:${uuid(600)}`];
   const parameters={mode:'subject-reference',seconds:8,assetIds:[1],businessAssetIds:businessUploads,referenceGenerationIds:generatedSources,
     providerAssets:[{id:'character',type:'image'}],referenceOrder,prompt:'reference image 2 enters before reference image 3.'};
   const editor={prompt:'@白石澪 enters before @紙城.',mentions:{白石澪:'provider:character',紙城:'local:1',unused:'foreign:reference'}};
   const post=await send({...body(1,'video',parameters),editor});
   assert.equal(post.status,201); assert.equal((await post.json()).generation.reuseInput,undefined);
   assert.equal(lastPayload.editor,undefined); assert.equal(lastPayload.prompt,parameters.prompt);
   pollVideo={status:'completed',output_url:'https://example.volces.com/own.mp4'};
   const completed=(await(await get(jobs[0].id)).json()).generation;
   assert.equal(completed.status,'completed'); assert.ok(completed.videoUrl); assert.equal(completed.reuseInput,undefined);
   const calls=providerCalls+lookupCalls+generatedReferenceCalls+businessUploadCalls;
   const response=await getReuse(completed.id); assert.equal(response.status,200); assert.match(response.headers.get('cache-control'),/no-store/);
   const {reuse:snapshot}=await response.json();
   assert.deepEqual(snapshot.parameters,{mode:'subject-reference',seconds:8});
   assert.deepEqual(snapshot.references.map(ref=>ref.key),referenceOrder);
   assert.deepEqual(snapshot.references.map(ref=>ref.source),['generated','provider','local','upload']);
   assert.deepEqual(snapshot.editor,{prompt:editor.prompt,mentions:{白石澪:'provider:character',紙城:'local:1'}});
   assert.equal(snapshot.references[2].asset.src,'/api/assets/1/raw');
   assert.equal(snapshot.missingReferences,0); assert.doesNotMatch(JSON.stringify(snapshot),/private-blob|opaque-|apiKey|foreign:reference/);
   assert.equal(providerCalls+lookupCalls+generatedReferenceCalls+businessUploadCalls,calls);
   const listed=(await(await routes.GET(new NextRequest('https://fixture.invalid/api/business/generations'))).json()).generations;
   assert.equal(listed[0].reuseInput,undefined);
 });
 await test('reuse omits unavailable references and editor bindings after key rotation or asset removal', async () => {
   assetRows=[{id:1,user_id:7,content_type:'image/png',size:100}];
   registeredAssets=[{id:'character',type:'image',status:'active',apiKey:credentials.get(activeCredential)}];
   const parameters={mode:'first-last-frame',assetIds:[1],providerAssets:[{id:'character',type:'image'}],
     referenceOrder:['provider:character','local:1'],prompt:'reference image 1 in a coastal garden.'};
   await send({...body(1,'video',parameters),editor:{prompt:'@Mio in a coastal garden.',mentions:{Mio:'provider:character'}}});
   const id=jobs[0].id;
   activeCredential=uuid(77); credentials.set(activeCredential,'sk-rotated-fixture');
   const {reuse:snapshot}=await(await getReuse(id)).json();
   assert.deepEqual(snapshot.references.map(ref=>ref.key),['local:1']); assert.equal(snapshot.missingReferences,1); assert.equal(snapshot.editor,undefined);
   registeredAssets[0].apiKey=credentials.get(activeCredential); assetRows[0].user_id=99;
   const {reuse:afterRemoval}=await(await getReuse(id)).json();
   assert.deepEqual(afterRemoval.references.map(ref=>ref.key),['provider:character']); assert.equal(afterRemoval.missingReferences,1);
   assert.equal(providerCalls,1);
 });
 await test('reuse gates legacy and private jobs and drops malformed editor metadata', async () => {
   failProvider=new SirayaApiError(402,'fixture balance');
   const post=await send({...body(1,'video',{model:'NSFW-SIRAYA-Seedance-2.5',seconds:8}),editor:{prompt:'sk-12345678901234567890',mentions:{}}});
   assert.equal((await post.json()).generation.status,'failed');
   const id=jobs[0].id;
   assert.equal((await(await getReuse(id)).json()).reuse.editor,undefined);
   assert.equal((await(await getReuse(id)).json()).reuse.parameters.seconds,8);
   adult=false; assert.equal((await getReuse(id)).status,403);
   adult=true; jobs[0].user_id=99; assert.equal((await getReuse(id)).status,404);
   jobs[0].user_id=7; jobs[0].account_id=uuid(99); assert.equal((await getReuse(id)).status,404);
   jobs[0].account_id=account.id; jobs[0].output=null; assert.deepEqual(await(await getReuse(id)).json(),{reuse:null});
   approval=false; assert.equal((await getReuse(id)).status,403); assert.equal(providerCalls,1);
 });
 await test('Wan 3.0 submit and reuse preserve native source order and the flat async format', async () => {
   businessUploads=[uuid(900),uuid(901)];
   const referenceOrder=businessUploads.toReversed().map(id=>`business:${id}`);
   const parameters={model:'wan3.0-video-pro',mode:'first-last-frame',seconds:-1,resolution:'2k',businessAssetIds:businessUploads,referenceOrder,prompt:'Image 2 crosses the bridge.'};
   const editor={prompt:'@Mio crosses the bridge.',mentions:{Mio:`business:${businessUploads[0]}`}};
   const response=await send({...body(1,'video',parameters),editor});
   assert.equal(response.status,201);
   assert.equal(lastPayload.model,'wan3.0-video-pro'); assert.equal(lastPayload.async,true); assert.equal(lastPayload.seconds,-1);
   assert.equal(lastPayload.resolution,'2k'); assert.ok(lastPayload.first_frame.endsWith(businessUploads[1])); assert.ok(lastPayload.last_frame.endsWith(businessUploads[0]));
   for(const key of ['mode','referenceOrder','businessAssetIds','frame_images','editor']) assert.equal(lastPayload[key],undefined);
   const {reuse:snapshot}=await(await getReuse(jobs[0].id)).json();
   assert.deepEqual(snapshot.references.map(ref=>ref.key),referenceOrder); assert.deepEqual(snapshot.editor,editor); assert.equal(providerCalls,1);
 });
 await test('Wan 3.0 mixed personal and business images keep their picked order and mention labels through reuse', async () => {
   assetRows=[{id:7,user_id:7,content_type:'image/png',size:1024}];
   businessUploads=[uuid(902)];
   const referenceOrder=[`business:${businessUploads[0]}`,'local:7'];
   const parameters={model:'wan3.0-video-prime-spicy',mode:'subject-reference',assetIds:[7],businessAssetIds:businessUploads,referenceOrder,prompt:'Image 2 crosses the bridge.'};
   const editor={prompt:'@Mio crosses the bridge.',mentions:{Mio:'local:7'}};
   const response=await send({...body(1,'video',parameters),editor});
   assert.equal(response.status,201);
   assert.equal(lastPayload.model,parameters.model);
   assert.deepEqual(lastPayload.reference_images,[
     `https://fixture.invalid/api/business/provider-assets/source/opaque-${businessUploads[0]}`,
     'https://fixture.invalid/api/business/references/opaque-7',
   ]);
   for(const key of ['assetIds','businessAssetIds','referenceOrder','referenceGenerationIds','editor']) assert.equal(lastPayload[key],undefined);
   const {reuse:snapshot}=await(await getReuse(jobs[0].id)).json();
   assert.deepEqual(snapshot.references.map(ref=>ref.key),referenceOrder);
   assert.equal(snapshot.references[1].asset.src,'/api/assets/7/raw');
   assert.deepEqual(snapshot.editor,editor);
 });
 await test('Wan 2.2 and 2.7 keyframes preserve personal and business source order on the wire', async () => {
   assetRows=[{id:7,user_id:7,content_type:'image/webp',size:1024}];
   businessUploads=[uuid(902)];
   for(const [index,model] of ['wan2.2-i2v-spicy','wan2.7-i2v-spicy','wan2.7-i2v'].entries()){
     const referenceOrder=[`business:${businessUploads[0]}`,'local:7'];
     assert.equal((await send(body(index+1,'video',{model,mode:'first-last-frame',assetIds:[7],businessAssetIds:businessUploads,referenceOrder}))).status,201);
     const [first,last]=model.startsWith('wan2.2')?[lastPayload.image,lastPayload.last_image]:lastPayload.frame_images.map(ref=>ref.image_url);
     assert.ok(first.endsWith(businessUploads[0]));
     assert.match(last,/\/api\/business\/references\/opaque-7$/);
     assert.equal(lastPayload.assetIds,undefined);
     assert.equal(lastPayload.referenceOrder,undefined);
   }
   assert.equal(localReferenceCalls,3);
   assert.equal(businessUploadCalls,3);
 });
 await test('Wan personal references enforce shape, ownership and adult verification before reservation', async () => {
   assetRows=[{id:7,user_id:99,content_type:'image/png',size:1024}];
   const model='wan3.0-video-prime-spicy';
   const firstFrame={model,mode:'image-to-video',assetIds:[7],referenceOrder:['local:7']};
   const reject=async extra=>assert.equal((await send(body(1,'video',{...firstFrame,...extra}))).status,400);
   await reject({referenceOrder:['local:8']});
   await reject({mode:'text-to-video'});
   await reject({model:'wan2.7-t2v'});
   assert.equal(localReferenceCalls,0);
   adult=false;
   assert.equal((await send(body(1,'video',firstFrame))).status,403);
   assert.equal(localReferenceCalls,0);
   adult=true;
   await reject({});
   assetRows[0].user_id=7;
   assetRows[0].content_type='image/gif';
   await reject({});
   assert.equal(localReferenceCalls,2);
   assert.equal(jobs.length,0);
   assert.equal(providerCalls,0);
 });
 console.log(`Business generation: ${count} actual route/security cases passed; no paid calls, platform credits or live database changes.`);
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=originalFetch});
