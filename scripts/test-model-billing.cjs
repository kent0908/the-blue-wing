const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache=new Map();
function load(file,overrides={}){file=path.resolve(file);if(cache.has(file)&&!Object.keys(overrides).length)return cache.get(file);const mod={exports:{}};const requireLocal=id=>{if(id in overrides)return overrides[id];if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));if(id.startsWith('@/'))return load(id.slice(2)+'.ts');throw Error('Unexpected '+id)};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(requireLocal,mod,mod.exports);if(!Object.keys(overrides).length)cache.set(file,mod.exports);return mod.exports;}

const {creditsFromRateCard}=load('lib/pricing.ts');
const {creditCostFromRate}=load('lib/creditFormula.ts');
const {canonicalBillingModel}=load('lib/billingModel.ts');
const {canvasNodeCredits,canvasRunCredits}=load('lib/canvas/cost.ts');
const rates=[{modelId:'Dola-Seedream-5.0-pro',modality:'image',credits:36},{modelId:'NSFW-Dola-Seedream-5.0-pro',modality:'image',credits:36},{modelId:'SIRAYA-Seedance-2.0',modality:'video',credits:7}];
let checked=0;
for(const model of ['Dola-Seedream-5.0-pro','seedream-5-0-pro-260628','dola-seedream-5-0-pro-260628','NSFW-seedream-5-0-pro-260628']) { assert.equal(creditsFromRateCard(rates,model,{imageCount:2}),72); assert.match(canonicalBillingModel(model),/Dola-Seedream/); checked++; }
for(const resolution of ['480p','720p','1080p','4k']) {const opts={seconds:4,resolution};assert.equal(creditsFromRateCard(rates,'SIRAYA-Seedance-2.0',opts),creditCostFromRate({modality:'video',credits:7,...opts}));checked++;}
assert.equal(creditsFromRateCard(rates,'unknown',{}),null);checked++;
const image={id:'a',type:'image',data:{model:'seedream-5-0-pro-260628'}};
const video={id:'b',type:'video',data:{model:'SIRAYA-Seedance-2.0',seconds:4,resolution:'720p'}};
assert.equal(canvasRunCredits({nodes:[image,video],edges:[]},rates),100); checked++;
assert.equal(canvasRunCredits({nodes:[image,video],edges:[]},rates,['a']),36);checked++;
assert.equal(canvasNodeCredits({type:'text',data:{}},rates),0);checked++;
assert.equal(canvasNodeCredits({...video,data:{...video.data,model:'SIRAYA-Seedance-2.0-mini',resolution:'1080p'}},rates),null);checked++;
console.log('PASS '+checked+' billing/canvas checks; zero network or paid calls');
