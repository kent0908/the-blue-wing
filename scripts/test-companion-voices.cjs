const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in mocks)return mocks[id];if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'),mocks);throw Error(id)},m,m.exports);return m.exports;}
const voices=load('lib/companionVoices.ts'),seeds=load('lib/companionOfficialSeed.ts').OFFICIAL_CHARACTER_SEEDS;
assert.deepEqual(Object.keys(voices.OFFICIAL_VOICES).sort(),seeds.map(s=>s.key).sort());
for(const seed of seeds){
 const v=voices.companionVoiceSettings({official_key:seed.key});
 assert.equal(v.language,'ja-JP');
 for(const l of voices.COMPANION_LANGUAGES){assert.ok(v.casting.samples[l.id]);assert.ok(voices.companionSpeechDirection({official_key:seed.key},l.id).length<=200);}
 assert.equal(voices.companionVoiceSettings({official_key:seed.key,voice_name:'Zephyr',speech_language:'en-US'}).voiceName,'Zephyr');
 assert.equal(voices.companionVoiceSettings({official_key:seed.key,speech_language:'zh-TW'}).language,'zh-TW');
}
assert.equal(voices.companionVoiceSettings({}).language,'zh-TW');
assert.equal(voices.isCompanionLanguage('fr-FR'),false);
const characters=load('lib/characters.ts',{'./db':{sql:()=>{throw Error('unexpected DB')} }});
for(const l of voices.COMPANION_LANGUAGES){
 const prompt=characters.buildSystemPrompt({name:'白石 澪',official_key:'mio',content_rating:'all_ages',affection:0,personality:'冷靜',profile:{},likes:'',memory_summary:'',speech_language:l.id},{name:'',bio:''});
 assert.ok(prompt.includes(l.instruction));assert.ok(!prompt.includes('請一律使用繁體中文'));assert.ok(prompt.includes('全年齡角色'));
}
(async()=>{
 let allowed=true,saved;
 const route=load('app/api/characters/[id]/voice/route.ts',{
 'next/server':{NextResponse:Response},'@/lib/apiauth':{requireAdultUser:async()=>allowed?{user:{id:7}}:{error:new Response(null,{status:401})}},
 '@/lib/characterAudio':{setCharacterVoice:async(...args)=>{saved=args;return args[1]===9}},'@/lib/errors':{errorResponse:()=>new Response(null,{status:500})},
 '@/lib/voices':load('lib/voices.ts'),'@/lib/companionVoices':voices,
 });
 for(const language of ['ja-JP','zh-TW','en-US']){const r=await route.PUT({json:async()=>({voiceName:null,language})},{params:Promise.resolve({id:'9'})});assert.equal(r.status,200);assert.deepEqual(saved,[7,9,null,language]);}
 assert.equal((await route.PUT({json:async()=>({voiceName:null,language:'fr-FR'})},{params:Promise.resolve({id:'9'})})).status,400);
 assert.equal((await route.PUT({json:async()=>({voiceName:'not-a-voice',language:'ja-JP'})},{params:Promise.resolve({id:'9'})})).status,400);
 assert.equal((await route.PUT({json:async()=>({voiceName:null})},{params:Promise.resolve({id:'10'})})).status,404);
 allowed=false;assert.equal((await route.PUT({},{})).status,401);
 let owned=true,cache=null,synthesis,charges=0;
 const speechRoute=load('app/api/characters/[id]/messages/[messageId]/speech/route.ts',{
 'next/server':{NextResponse:Response},'@vercel/blob':{put:async()=>({pathname:'safe.wav'})},
 '@/lib/apiauth':{requireAdultUser:async()=>({user:{id:7}})},'@/lib/assets':{blobConfigured:()=>true},
 '@/lib/characterAudio':{ownedAssistantMessage:async()=>owned?{content:'こんにちは',official_key:'mio',voice_name:null,speech_language:'ja-JP'}:null,getMessageAudio:async()=>cache,saveMessageAudio:async()=>{}},
 '@/lib/credits':{creditCost:async()=>1,getBalance:async()=>100},'@/lib/creditTransactions':{paidCall:async(u,c,k,m,fn)=>{charges++;return {result:await fn(),chargeId:1}},refundCharge:async()=>{}},
 '@/lib/errors':{errorResponse:e=>{throw e}},'@/lib/speech':{SPEECH_MODEL:'test',speechConfigured:()=>true,synthesizeSpeech:async i=>{synthesis=i;return {audio:Buffer.alloc(4),seconds:1,contentType:'audio/wav'}}},
 '@/lib/speechText':{spokenText:s=>s},'@/lib/companionVoices':voices,
 });
 const ctx={params:Promise.resolve({id:'9',messageId:'11'})};
 assert.equal((await speechRoute.POST({},ctx)).status,200);assert.equal(synthesis.voiceName,'Kore');assert.equal(synthesis.language,'ja-JP');assert.ok(synthesis.style.includes('冷靜'));assert.equal(charges,1);
 cache={pathname:'old.wav',voice_name:'Leda'};assert.equal((await speechRoute.POST({},ctx)).status,200);assert.equal(charges,1);
 owned=false;assert.equal((await speechRoute.POST({},ctx)).status,404);assert.equal(charges,1);
 console.log('PASS all 10 cast profiles / 30 samples, language defaults and overrides, prompts, settings authorization, TTS style forwarding, owned cache replay without charging');
})().catch(e=>{console.error(e);process.exitCode=1});
