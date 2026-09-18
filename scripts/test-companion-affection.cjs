const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='./db'?{sql:()=>{throw Error('No DB calls allowed')}}:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;}
const {buildSystemPrompt}=load('lib/characters.ts');const {EMPTY_PROFILE}=load('lib/characterProfile.ts');
const base={name:'Test',personality:'友善',likes:'',profile:{...EMPTY_PROFILE,age:25},memory_summary:'',affection:100,content_rating:'adult',official_key:null};
const persona={name:'User',bio:'',nickname:'小月'};
assert.ok(buildSystemPrompt(base,persona).includes('不因高分自動改變身分'));
assert.equal(buildSystemPrompt({...base,affection:0},persona),buildSystemPrompt({...base,affection:100},persona));
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
console.log('PASS: relationship settings persist and dialogue no longer depends on numeric thresholds');
