const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;}
const tariffs=load('lib/videoProviderPrices.ts'),pricing=load('lib/pricing.ts'),pub=load('lib/sirayaPublicPrices.ts'),formula=load('lib/creditFormula.ts');
assert.deepEqual(tariffs.videoProviderPrice('kling-2.5-turbo','720p',false),{min:.042,max:.042});
assert.deepEqual(tariffs.videoProviderPrice('kling-2.5-turbo','1080p',false),{min:.07,max:.07});
assert.equal(tariffs.videoProviderPrice('kling-2.5-turbo','1080p',true),null);
assert.deepEqual(tariffs.videoProviderPrice('kling-2.6','1080p',true),{min:.07,max:.14});
assert.equal(tariffs.videoProviderPrice('kling-3.0','720p',false),null,'Mislabelled 1080 rule must not create a fictional 720 price');
assert.deepEqual(tariffs.videoProviderPrice('kling-3.0','1080p',false),{min:.084,max:.112});
assert.deepEqual(tariffs.videoProviderPrice('kling-3.0','4k'),{min:.42,max:.42});
assert.equal(pub.publicPrice('kling-3.0').verification,'pending');
assert.equal(pub.publicPrice('kling-2.6').verification,'pending');
assert.equal(pub.publicPrice('minimax-m3').verification,'pending');
assert.equal(pub.publicPrice('minimax-m3').components.find(c=>c.id==='longCached').price,.12);
assert.equal(pub.publicPrice('minimax-h3').components.find(c=>c.scenario==='2k-native').price,.13);
assert.match(pub.publicPrice('minimax-h3-max').note,/0\.074/);
assert.equal(pricing.estimateCost({model:'minimax-h3',modality:'video',prompt:'test',resolution:'2k',seconds:4}),.52);
assert.ok(Number.isNaN(pricing.estimateCost({model:'minimax-h3',modality:'video',prompt:'test',resolution:'1080p',seconds:4})));
assert.equal(pricing.formatUSD(NaN),'—');
assert.equal(formula.creditCostFromRate({modality:'video',credits:16,resolution:'768p',seconds:4}),164);
assert.equal(formula.creditCostFromRate({modality:'video',credits:16,resolution:'2k',seconds:4}),576);
for(const id of Object.keys(tariffs.VIDEO_PROVIDER_TARIFFS)){const p=pub.publicPrice(id);assert.equal(p.source,'https://console.siraya.ai/models');assert.equal(p.checkedAt,'2026-10-19');assert.ok(p.components.every(c=>c.scenario&&c.unit==='second'));}
console.log('PASS video tariffs: native audio and resolution tiers, ambiguous rules remain unknown/ranges, no false zero price, full M3 reference tiers, reference-image surcharge note, shared 768p/2K retail multipliers. No paid calls.');
