const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='./db'?{sql:()=>{throw Error('No DB calls allowed')}}:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;}
const {buildSystemPrompt}=load('lib/characters.ts');const {EMPTY_PROFILE}=load('lib/characterProfile.ts');
const base={name:'Test',personality:'友善',likes:'',profile:{...EMPTY_PROFILE,age:25},memory_summary:'',affection:100,content_rating:'adult',official_key:null};
const persona={name:'User',bio:'',nickname:'小月'};
assert.ok(buildSystemPrompt(base,persona).includes('不因高分自動改變身分'));
// 好感度 must reach the conversation: identical prompts at 0 and 100 was the
// gap this replaced (lib/romanceDepth.ts). Identity still must not move.
assert.notEqual(buildSystemPrompt({...base,affection:0},persona),buildSystemPrompt({...base,affection:100},persona));
assert.equal(buildSystemPrompt({...base,affection:0},persona),buildSystemPrompt({...base,affection:19},persona));
for(const a of [0,20,40,60,80,100]) assert.ok(buildSystemPrompt({...base,affection:a},persona).includes('現在的相處深度'));
assert.ok(buildSystemPrompt({...base,affection:80},persona).includes('不描寫露骨性行為或裸露'));
assert.ok(buildSystemPrompt({...base,affection:100},persona).includes('像長期伴侶一樣自然親密'));
assert.ok(buildSystemPrompt(base,persona).includes('小月'));
assert.ok(!buildSystemPrompt({...base,affection:99},persona).includes('目前已達真實情感伴侶階段'));
const minor=buildSystemPrompt({...base,content_rating:'all_ages',official_key:'mio'},persona);
assert.ok(!minor.includes('目前已達真實情感伴侶階段'));assert.ok(minor.includes('只會是同學、隊友、朋友'));
console.log('PASS: 100-point adult companion, nickname, 99-point boundary, official friendship policy');

const {validateProfile,readProfile,profilePrompt}=load('lib/characterProfile.ts');
const cropped=validateProfile({...EMPTY_PROFILE,avatarCrop:{x:24,y:80,zoom:4}});
assert.deepEqual(readProfile(cropped).avatarCrop,{x:24,y:80,zoom:4});
assert.ok(!profilePrompt(cropped).includes('avatarCrop'));
for(const crop of [{x:0,y:0,zoom:9},{x:301,y:0,zoom:1},{x:NaN,y:0,zoom:1},{x:'1',y:0,zoom:1}]) assert.throws(()=>validateProfile({...EMPTY_PROFILE,avatarCrop:crop}));
console.log('PASS: crop persistence, numeric limits and exclusion from generation prompts');

const settings=validateProfile({...EMPTY_PROFILE,relationshipSettings:{hopes:'慢慢了解彼此',conflictStyle:'先聽完再表達'}});
assert.equal(readProfile(settings).relationshipSettings.hopes,'慢慢了解彼此');
assert.ok(profilePrompt(settings).includes('先聽完再表達'));
assert.ok(!profilePrompt(settings,true).includes('先聽完再表達'));
assert.throws(()=>validateProfile({...EMPTY_PROFILE,relationshipSettings:{hopes:'x'.repeat(501)}}));
console.log('PASS: relationship settings persist and set the relationship independently of the score');

const {currentRelationshipPrompt,buildMemoryUpdatePrompt}=load('lib/characters.ts');
const spouse={...base,profile:{...base.profile,relationship:'夫妻'},memory_summary:'以前彼此陌生'};
const spousePrompt=buildSystemPrompt(spouse,persona);
assert.ok(spousePrompt.lastIndexOf('目前有效的關係設定')>spousePrompt.indexOf('以前彼此陌生'));
assert.ok(spousePrompt.includes('"relationship":"夫妻"'));
assert.equal(currentRelationshipPrompt({...spouse,official_key:'mio'}),'');
assert.equal(currentRelationshipPrompt({...spouse,content_rating:'all_ages'}),'');
assert.equal(currentRelationshipPrompt(base),'');
assert.ok(buildMemoryUpdatePrompt(spouse,[]).includes('移除過時的關係判斷'));
assert.notEqual(currentRelationshipPrompt(spouse),currentRelationshipPrompt({...spouse,profile:{...spouse.profile,relationship:'朋友'}}));
console.log('PASS: current relationship precedence, updated memory, official and all-ages isolation');

const {relationshipFloorIndex,romanceDepthIndex,romanceDepthPrompt}=load('lib/romanceDepth.ts');
// a configured couple starts warm — never made to re-earn the relationship (33b9225)
assert.equal(relationshipFloorIndex('戀人'),3);
assert.equal(relationshipFloorIndex('夫妻'),4);
assert.equal(relationshipFloorIndex('曖昧'),2);
for(const r of ['','新朋友','同事','室友','冒險夥伴','好友']) assert.equal(relationshipFloorIndex(r),0);
// a wish is not a current identity — same qualifier rule as currentRelationshipPrompt
for(const r of ['希望成為戀人','尚未交往','單戀中','前男友','還不是情侶']) assert.equal(relationshipFloorIndex(r),0);
// the floor only ever widens; points above it still win
assert.equal(romanceDepthIndex(0,'戀人'),3);
assert.equal(romanceDepthIndex(5,'戀人'),5);
assert.equal(romanceDepthIndex(5,'同事'),5);
assert.equal(romanceDepthIndex(0,'同事'),0);
for(const i of [-3,0,2,5,99]) assert.ok(romanceDepthPrompt(i).includes('不描寫露骨性行為或裸露'));
// a brand-new configured partner must not read as a stranger
const lover={...base,affection:0,profile:{...base.profile,relationship:'戀人'}};
assert.ok(buildSystemPrompt(lover,persona).includes('牽手、擁抱'));
// official rows: affection is frozen at 0, so no score-derived tier is applied
assert.ok(!buildSystemPrompt({...base,affection:0,official_key:'mio'},persona).includes('現在的相處深度'));
assert.ok(!buildSystemPrompt({...base,content_rating:'all_ages',official_key:'mio'},persona).includes('現在的相處深度'));
console.log('PASS: affection now moves expressive depth, configured relationships set the floor, ceiling unchanged');
