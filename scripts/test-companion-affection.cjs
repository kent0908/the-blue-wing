const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='./db'?{sql:()=>{throw Error('No DB calls allowed')}}:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;}
const {buildSystemPrompt}=load('lib/characters.ts');const {EMPTY_PROFILE}=load('lib/characterProfile.ts');
const base={name:'Test',personality:'友善',likes:'',profile:{...EMPTY_PROFILE,age:25},memory_summary:'',affection:100,content_rating:'adult',official_key:null};
const persona={name:'User',bio:'',nickname:'小月'};
assert.ok(buildSystemPrompt(base,persona).includes('目前已達真實情感伴侶階段'));
assert.ok(buildSystemPrompt(base,persona).includes('小月'));
assert.ok(!buildSystemPrompt({...base,affection:99},persona).includes('目前已達真實情感伴侶階段'));
const minor=buildSystemPrompt({...base,content_rating:'all_ages',official_key:'mio'},persona);
assert.ok(!minor.includes('目前已達真實情感伴侶階段'));assert.ok(minor.includes('只會是同學、隊友、朋友'));
console.log('PASS: 100-point adult companion, nickname, 99-point boundary, official friendship policy');
