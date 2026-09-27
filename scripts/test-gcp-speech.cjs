const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function wav(n=48000) {const b=Buffer.alloc(44+n);b.write('RIFF');b.writeUInt32LE(36+n,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n,40);return b;}
let calls=0,seen,reply=()=>Response.json({audioContent:wav().toString('base64')});
function load(file,overrides){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in overrides)return overrides[id];throw Error('Unexpected dependency '+id)},m,m.exports);return m.exports;}
const {synthesizeGcpPcm}=load('lib/gcpSpeech.ts',{
 './speechWav':load('lib/speechWav.ts',{}),
 './geminiSpeech38':{},
 './gcpAuth':{gcpAccessToken:async()=> 'test-only-token'},
 './voices':{resolveVoice:()=> 'Kore'},
 './modelMonitoring':{monitoredModelFetch:async(url,init,meta)=>{calls++;seen={url,init,meta};return reply();}},
});
(async()=>{
 const a=await synthesizeGcpPcm({text:'晚安，明天見。'});assert.equal(a.seconds,1);assert.equal(a.pcm.length,48000);
 const body=JSON.parse(seen.init.body);assert.equal(body.voice.languageCode,'cmn-TW');assert.equal(body.voice.modelName,'gemini-2.5-flash-tts');assert.equal(body.audioConfig.audioEncoding,'LINEAR16');assert.equal(body.input.text,'晚安，明天見。');assert.equal(seen.meta.provider,'google-cloud');assert.equal(a.usage,undefined);
 await assert.rejects(()=>synthesizeGcpPcm({text:'字'.repeat(1334)}));await assert.rejects(()=>synthesizeGcpPcm({text:' '}));assert.equal(calls,1);
 reply=()=>new Response('private upstream body',{status:429});await assert.rejects(()=>synthesizeGcpPcm({text:'test'}),e=>e.message.includes('429')&&!e.message.includes('private'));
 for(const audioContent of ['', 'not valid!',Buffer.alloc(3).toString('base64'),wav(3).toString('base64'),wav().subarray(0,100).toString('base64')]){reply=()=>Response.json({audioContent});await assert.rejects(()=>synthesizeGcpPcm({text:'test'}));}
 let config;const auth=load('lib/gcpAuth.ts',{'@vercel/oidc':{getVercelOidcToken:async()=> 'test-oidc'},'google-auth-library':{ExternalAccountClient:{fromJSON:c=>{config=c;return {getAccessToken:async()=>({token:'short-lived-test'})}}}}});
 const saved={...process.env};try{
 for(const k of ['GCP_PROJECT_ID','GCP_PROJECT_NUMBER','GCP_SERVICE_ACCOUNT_EMAIL','GCP_WORKLOAD_IDENTITY_POOL_ID','GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'])delete process.env[k];
 assert.equal(auth.gcpConfigured(),false);await assert.rejects(()=>auth.gcpAccessToken());
 Object.assign(process.env,{GCP_PROJECT_ID:'test',GCP_PROJECT_NUMBER:'123',GCP_SERVICE_ACCOUNT_EMAIL:'test@test.iam.gserviceaccount.com',GCP_WORKLOAD_IDENTITY_POOL_ID:'tbw',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'vercel'});
 assert.equal(await auth.gcpAccessToken(),'short-lived-test');assert.ok(config.audience.endsWith('/workloadIdentityPools/tbw/providers/vercel'));assert.equal(await config.subject_token_supplier.getSubjectToken(),'test-oidc');assert.equal(config.private_key,undefined);
 }finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved)}
 let denied=true,allowed=true,generated=0;
 const route=load('app/api/crm/speech-test/route.ts',{
  'next/server':{NextResponse:Response},
  '@/lib/apiauth':{requireAdmin:async()=>denied?{error:new Response(null,{status:403})}:{user:{role:'admin'}}},
  '@/lib/gcpAuth':{gcpConfigured:()=>true},
  '@/lib/gcpSpeech':{GCP_SPEECH_MODEL:'gemini-2.5-flash-tts',synthesizeGcpPcm:async(input)=>{generated++;assert.ok(input.text.includes('今天辛苦了'));return {pcm:Buffer.alloc(48000),seconds:1}}},
  '@/lib/speech':{wavFromPcm16:b=>b},
  '@/lib/rateLimit':{limitRequest:async()=>allowed},
 });
 const oldFlag=process.env.GCP_SPEECH_TEST_ENABLED;
 try {
  process.env.GCP_SPEECH_TEST_ENABLED='true';
  assert.equal((await route.POST({})).status,403);assert.equal((await route.GET({})).status,403);
  denied=false;process.env.GCP_SPEECH_TEST_ENABLED='false';assert.equal((await route.POST({})).status,503);
  process.env.GCP_SPEECH_TEST_ENABLED='true';allowed=false;assert.equal((await route.POST({})).status,429);assert.equal(generated,0);
  allowed=true;const response=await route.POST({});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/wav');assert.equal(generated,1);
 } finally {if(oldFlag===undefined)delete process.env.GCP_SPEECH_TEST_ENABLED;else process.env.GCP_SPEECH_TEST_ENABLED=oldFlag;}
 console.log('PASS admin-only guard, disabled gate, global cost limit and fixed-text audio response');
 console.log('PASS GCP TTS: audio duration, Taiwan locale, format, size, upstream error redaction, empty/malformed audio, no invented usage, keyless identity configuration');
})().catch(e=>{console.error(e);process.exitCode=1});
