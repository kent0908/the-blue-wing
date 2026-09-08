const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, deps = {}) {
  const m = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(id => {if (!(id in deps)) throw Error(id);return deps[id]},m,m.exports);
  return m.exports;
}
const caps = load('lib/videoModels.ts');
class SirayaApiError extends Error { constructor(status,message) {super(message);this.status=status} }
const labels=load('lib/modelLabel.ts');
const billing=load('lib/billingModel.ts');
const images=load('lib/imageModels.ts',{'./modelLabel':labels,'./billingModel':billing});
const safety=load('lib/promptSafety.ts');
const layers=load('lib/layerDecomposition.ts',{'./siraya':{SirayaApiError}});
const {validateGeneration} = load('lib/generationValidation.ts', {'./imageModels':images,'./layerDecomposition':layers,'./promptSafety':safety,'./siraya':{SirayaApiError},'./videoModels':caps});
const matrix = [
  ...['1.0-i2v','1.0-t2v'].map(v=>['happyhorse-'+v,['720p','1080p']]),
  ...['1.1-i2v','1.1-t2v'].map(v=>['happyhorse-'+v,['480p','720p','1080p']]),
  ...['ByteDance','NSFW'].flatMap(p=>['1.0-pro','1.0-pro-fast','1.5-pro'].map(v=>[p+'-Seedance-'+v,['480p','720p','1080p']])),
  ...['SIRAYA','NSFW'].flatMap(p=>[
    [p+'-Seedance-2.0',['480p','720p','1080p','4k']],
    ...['2.0-mini','2.0-fast','2.5'].map(v=>[p+'-Seedance-'+v,['480p','720p']])]),
  ['veo-3.1-generate-001',['720p','1080p','4k']],
];
for(const [model,expected] of matrix) {
  assert.deepEqual(caps.videoResolutionsForModel(model),expected,model);
  for(const resolution of ['480p','720p','1080p','4k']) {
    const request = {model,prompt:'test',resolution,seconds:5};
    if(expected.includes(resolution)) assert.doesNotThrow(()=>validateGeneration(request,'video'),model+' '+resolution);
    else assert.throws(()=>validateGeneration(request,'video'),e=>e.status===400,model+' '+resolution);
  }
  assert.ok(expected.includes(caps.normalizeVideoResolution(model,'unsupported')));
}
assert.deepEqual(caps.videoResolutionsForModel('dreamina-seedance-2-0-mini-260615'),['480p','720p']);
assert.deepEqual(caps.videoResolutionsForModel('dreamina-seedance-2-0-260128'),['480p','720p','1080p','4k']);
assert.deepEqual(caps.videoResolutionsForModel('new-unreviewed-video-model'),[]);
assert.throws(()=>validateGeneration({model:'new-unreviewed-video-model',prompt:'test'},'video'),e=>e.status===400);
assert.equal(caps.normalizeVideoResolution('SIRAYA-Seedance-2.0-mini','1080p'),'720p');
assert.equal(caps.normalizeVideoResolution('SIRAYA-Seedance-2.0','4k'),'4k');
console.log(`PASS: ${matrix.length} live catalogue models, 76 resolution acceptance/rejection cases; aliases, model switching and unknown models checked. No paid API calls.`);
