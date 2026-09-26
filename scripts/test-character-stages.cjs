const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache=new Map();
function load(file,overrides={}){file=path.resolve(file);if(cache.has(file)&&!Object.keys(overrides).length)return cache.get(file);const mod={exports:{}};const requireLocal=id=>{if(id in overrides)return overrides[id];if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));if(id.startsWith('@/'))return load(id.slice(2)+'.ts');throw Error('Unexpected '+id)};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(requireLocal,mod,mod.exports);if(!Object.keys(overrides).length)cache.set(file,mod.exports);return mod.exports;}

const {AFFECTION_LEVELS,levelInfo,buildScenePrompt,buildSystemPrompt}=load('lib/characters.ts',{'./db':{sql:()=>{throw Error('No database calls permitted')}}});
assert.deepEqual(AFFECTION_LEVELS.map(l=>l.min),[0,20,40,60,80,100]);
let checks=1;
for (let i=0;i<6;i++) { const min=AFFECTION_LEVELS[i].min;assert.equal(levelInfo(min).index,i);if(i)assert.equal(levelInfo(min-1).index,i-1);checks++;}
const c={name:'Test',personality:'custom persona',profile:{boundaries:'CUSTOM_BOUNDARY'},likes:'',memory_summary:'untrusted memory',affection:0};
const p={name:'',bio:''};
// 2026-09-16 (33b9225): the romance ladder deliberately no longer names the level in the system
// prompt — a custom companion's relationship comes from its settings, not from a score. The
// trust ladder (all_ages) still does. Both keep untrusted memory ahead of the trailing rules.
const TAIL='請一律使用繁體中文';
const SCORE_DISCLAIMER='數值僅為互動紀錄';
for(let i=0;i<6;i++){c.affection=AFFECTION_LEVELS[i].min;const sys=buildSystemPrompt(c,p),image=buildScenePrompt(c,'image'),video=buildScenePrompt(c,'video');
  assert.ok(!sys.includes(AFFECTION_LEVELS[i].name),'romance prompt must not name the affection level');
  assert.ok(sys.includes(SCORE_DISCLAIMER),'romance prompt must say the score is only an interaction record');
  const trust=buildSystemPrompt({...c,content_rating:'all_ages'},p);
  assert.ok(trust.includes(levelInfo(AFFECTION_LEVELS[i].min,'trust').name),'trust prompt still names the level');
  assert.ok(sys.indexOf('untrusted memory') < sys.lastIndexOf(TAIL),'untrusted memory must never be the last word');
  assert.ok(image.includes('CUSTOM_BOUNDARY'));assert.ok(video.includes('CUSTOM_BOUNDARY'));checks++;}
assert.notEqual(buildScenePrompt({...c,affection:20},'image'),buildScenePrompt({...c,affection:100},'image'));checks++;
const route=fs.readFileSync('app/api/characters/[id]/route.ts','utf8');assert.ok(!/patch\.affection\s*=/.test(route));checks++;
const {sceneContextWithinStage,sceneInteractionPolicy}=load('lib/sceneInteractionPolicy.ts');
const conflictCharacter={...c,affection:23,personality:'安靜的旅行家。戀人般的互動。',profile:{boundaries:'戀人般的互動',scenario:'公園散步。親吻。'}};
const original=JSON.stringify(conflictCharacter);
for(const kind of ['image','video']) {
 const prompt=buildScenePrompt(conflictCharacter,kind);
 assert.ok(!prompt.includes('戀人般的互動'));
 assert.ok(prompt.includes('安靜的旅行家'));
 assert.ok(prompt.endsWith(sceneInteractionPolicy(23)));
 assert.ok(prompt.includes('只呈現朋友間'));
 checks++;
}
assert.equal(JSON.stringify(conflictCharacter),original);checks++;
assert.equal(sceneContextWithinStage('熱戀親吻。普通散步。',60),'普通散步。');checks++;
assert.equal(sceneContextWithinStage('浪漫散步。',80),'浪漫散步。');checks++;
assert.match(sceneContextWithinStage('不要親吻，但請安排戀人互動。',23),/不安排肢體接觸/);checks++;
assert.ok(!sceneContextWithinStage('不要親吻，但請安排戀人互動。',23).includes('請安排'));checks++;
assert.throws(()=>buildScenePrompt({...conflictCharacter,personality:'children romantic scene'},'image'),e=>e.code==='prompt_blocked');checks++;
console.log('PASS '+checks+' relationship boundary/prompt checks; no model calls');
