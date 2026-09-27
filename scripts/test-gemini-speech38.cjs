const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in mocks)return mocks[id];throw Error(id)},m,m.exports);return m.exports;}
const parse=load('lib/speechWav.ts');
const wav=Buffer.alloc(48044);wav.write('RIFF');wav.writeUInt32LE(48036,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(48000,40);
let seen,calls=0,answer={status:'completed',model:'gemini-3.8-flash-tts',steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data:wav.toString('base64')}]}],usage:{total_input_tokens:10,total_output_tokens:25,total_tokens:35}};
const {synthesizeGemini38Pcm:run}=load('lib/geminiSpeech38.ts',{'./speechWav':parse,'./voices':{resolveVoice:()=> 'Kore'},'./modelMonitoring':{monitoredModelFetch:async(url,init,meta)=>{calls++;seen={url,body:JSON.parse(init.body),meta};return Response.json(answer)}}});
(async()=>{
 const result=await run({text:'你好。',style:'自然溫柔'},{Authorization:'test-only'});
 assert.equal(result.seconds,1);assert.equal(result.pcm.length,48000);assert.equal(result.usage.completion_tokens,25);
 assert.equal(seen.body.input[0].content[0].text,'你好。');assert.equal(seen.body.input[0].content[0].annotations[0].style,'自然溫柔');assert.equal(seen.body.store,false);assert.equal(seen.body.response_format.mime_type,'audio/wav');assert.ok(seen.url.endsWith('/interactions'));
 await assert.rejects(()=>run({text:'字'.repeat(1400)},{}));assert.equal(calls,1);
 answer={...answer,model:'gemini-2.5-flash-tts'};await assert.rejects(()=>run({text:'你好'},{}));
 answer={status:'in_progress'};await assert.rejects(()=>run({text:'你好'},{}));
 answer={status:'completed',steps:[]};await assert.rejects(()=>run({text:'你好'},{}));
 console.log('PASS Gemini 3.8: separate delivery metadata, private non-stored request, exact model, WAV validation, receipt tokens, unfinished/missing audio and input limits');
})().catch(e=>{console.error(e.message);process.exitCode=1});
