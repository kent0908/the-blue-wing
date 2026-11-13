/* Sanitized current model IDs + actual pure catalog/image builders. No provider I/O. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts'):require(id),mod,mod.exports);cache.set(file,mod.exports);return mod.exports;}
const {buildBusinessModelCatalog}=load('lib/businessModelCatalog.ts');
const {getBusinessImageCapability,assertBusinessImageParameters}=load('lib/businessImageCapabilities.ts');
const {isGenerationPickerModel}=load('lib/generationPickerModels.ts');
const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/business-model-catalog-20261020.json','utf8'));
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
const result=buildBusinessModelCatalog({data:fixture.ids.map(id=>({id,object:'model',owned_by:'openai'}))});
test('all 142 granted IDs appear exactly once in executable or explicitly unavailable catalog',()=>{assert.equal(result.upstreamTotal,142);const ids=[...result.models,...result.unavailableModels].map(m=>m.id);assert.equal(ids.length,142);assert.equal(new Set(ids).size,142);assert.deepEqual(new Set(ids),new Set(fixture.ids));});
test('all 14 current image aliases are executable with correct metadata',()=>{const images=result.models.filter(m=>m.modality==='image');assert.equal(images.length,14);for(const image of images){const capability=getBusinessImageCapability(image.id);assert.ok(capability,image.id);assert.equal(image.maxReferenceImages,capability.maxReferenceImages);assert.equal(image.maxImageCount,capability.maxImageCount);assert.deepEqual(image.imageControls,capability.controls);}assert.ok(images.find(m=>m.id==='gpt-image-2.5-flare'));assert.ok(images.find(m=>m.id==='NSFW-Seedream-5.0-lite'));});
test('image counts and references follow their provider family instead of C retail batch limits',()=>{for(const id of ['gpt-image-2','gpt-image-2.5-sunburst','gpt-image-2.5-flare']){const caps=getBusinessImageCapability(id);assert.equal(caps.maxImageCount,10);assert.equal(caps.maxReferenceImages,16);}for(const id of ['gemini-3.1-flash-image','gemini-3.1-flash-lite-image','gemini-3-pro-image']){assert.equal(getBusinessImageCapability(id).maxImageCount,1);assert.equal(getBusinessImageCapability(id).maxReferenceImages,14);}assert.equal(getBusinessImageCapability('Dola-Seedream-5.0-pro').maxReferenceImages,10);assert.equal(getBusinessImageCapability('NSFW-Seedream-4.5').maxReferenceImages,14);});
test('current exact text grants remain executable without retail alias replacement',()=>{const text=result.models.filter(m=>m.modality==='text');assert.equal(text.length,86);for(const model of text)assert.ok(fixture.ids.includes(model.id));assert.ok(text.some(m=>m.id==='gpt-6.1-sol'));assert.ok(text.some(m=>/^claude-.*5\.5/.test(m.id)));assert.ok(text.some(m=>/^qwen3\.8/.test(m.id)));});
test('new grants distinguish Nano Banana image generation from unconfirmed video adapters', () => {
  const id = 'gemini-nano-banana-2.1';
  const videos = ['kling-4.0', 'kling-4.0-flash', 'gemini-omni-1.1-flash-preview'];
  const text = ['kimi-k3.1-pro', 'deepseek-v4.1-flash-economy'];
  const catalog = buildBusinessModelCatalog({ data: [id, ...videos, ...text].map(id => ({ id })) });
  const nano = catalog.models.find(model => model.id === id);
  assert.equal(nano.displayName, 'Nano Banana 2.1');
  assert.equal(nano.modality, 'image');
  assert.equal(nano.maxReferenceImages, 14);
  const request = { model: id, prompt: 'A blue paper feather', size: '1024x128', n: 1 };
  assert.doesNotThrow(() => assertBusinessImageParameters(request, 14));
  assert.throws(() => assertBusinessImageParameters(request, 15));
  assert.throws(() => assertBusinessImageParameters({ ...request, n: 2 }, 1));
  assert.equal(isGenerationPickerModel(id), false);
  for (const model of text) assert.equal(catalog.models.find(row => row.id === model)?.modality, 'text');
  for (const model of videos) assert.equal(catalog.unavailableModels.find(row => row.id === model)?.reason, 'adapter_pending');
});
test('specialized tools and retired Happyhorse cannot become chat models',()=>{for(const id of ['kling-avatar','kling-lip-sync','kling-face-recognition','kling-tts','qwen3-asr-flash','gemini-embedding-2'])assert.ok(result.unavailableModels.some(m=>m.id===id&&m.reason==='dedicated_tool'));for(const id of fixture.ids.filter(id=>id.startsWith('happyhorse-1.0-')))assert.ok(result.unavailableModels.some(m=>m.id===id&&m.reason==='retired'));assert.ok(!result.models.some(m=>m.modality==='text'&&/avatar|lip-sync|tts|asr|embedding/i.test(m.id)));});
test('catalog does not infer modality from misleading provider owner labels or unknown family IDs',()=>{const catalog=buildBusinessModelCatalog({data:[{id:'novel-unknown',owned_by:'openai'},{id:'gpt-6.1',owned_by:'something-else'},{id:'gpt-6.1'},{id:'sk-do-not-expose'},{id:'contains spaces'}]});assert.equal(catalog.upstreamTotal,2);assert.equal(catalog.models[0].id,'gpt-6.1');assert.equal(catalog.unavailableModels[0].reason,'unsupported_model');assert.throws(()=>buildBusinessModelCatalog(null));assert.throws(()=>buildBusinessModelCatalog({data:{}}));});
test('adult aliases retain age gates while stable ordering puts standard models first',()=>{const data=[{id:'uncensored-gpt-6'},{id:'NSFW-Seedream-4.0'},{id:'gpt-6.1'}];const catalog=buildBusinessModelCatalog({data});const byId=new Map(catalog.models.map(m=>[m.id,m.nsfw]));assert.equal(byId.get('uncensored-gpt-6'),true);assert.equal(byId.get('NSFW-Seedream-4.0'),true);assert.equal(byId.get('gpt-6.1'),false);assert.equal(catalog.models[0].id,'gpt-6.1');assert.deepEqual(catalog.models.map(m=>m.id),buildBusinessModelCatalog({data:[...data].reverse()}).models.map(m=>m.id));});
test('GPT quality is version-specific and output geometry enforces native constraints',()=>{const params={model:'gpt-image-2.5-flare',prompt:'An origami city',quality:'max',n:10,size:'3840x2160'};assert.doesNotThrow(()=>assertBusinessImageParameters(params,16));for(const extra of [{model:'gpt-image-2',quality:'max'},{n:11},{size:'3841x2160'},{size:'3840x3840'},{size:'1536x256'},{seed:1}])assert.throws(()=>assertBusinessImageParameters({...params,...extra},0));assert.doesNotThrow(()=>assertBusinessImageParameters({...params,size:'auto'},0));});
test('Gemini Lite cannot claim 2K and seed/n controls reject incompatible types',()=>{const params={model:'gemini-3.1-flash-lite-image',prompt:'A blue feather',seed:5,n:1,size:'1024x1024'};assert.doesNotThrow(()=>assertBusinessImageParameters(params,14));for(const extra of [{size:'2048x2048'},{quality:'high'},{seed:-1},{seed:1.1},{seed:'5'},{n:2}])assert.throws(()=>assertBusinessImageParameters({...params,...extra},0));assert.throws(()=>assertBusinessImageParameters(params,15));});
test('Seedream advertises only single-output documented controls and exact per-version reference counts',()=>{for(const model of ['ByteDance-Seedream-4.0','ByteDance-Seedream-4.5','Dola-Seedream-5.0-lite','Dola-Seedream-5.0-pro']){const caps=getBusinessImageCapability(model);assert.equal(caps.maxImageCount,1);assert.deepEqual(caps.controls,[]);assert.doesNotThrow(()=>assertBusinessImageParameters({model,prompt:'A paper garden',size:caps.sizes[0]},caps.maxReferenceImages));for(const extra of [{seed:5},{negative_prompt:'blur'},{n:2},{quality:'high'}])assert.throws(()=>assertBusinessImageParameters({model,prompt:'A paper garden',...extra},0));}});
test('advanced GPT output options remain bounded and unknown passthrough never enters a payload',()=>{const params={model:'gpt-image-2',prompt:'A paper feather',output_format:'jpeg',output_compression:80,background:'opaque',moderation:'auto'};assert.doesNotThrow(()=>assertBusinessImageParameters(params,0));for(const extra of [{output_compression:101},{output_compression:1.5},{output_format:'webp'},{background:'transparent'},{extra_body:{}},{image:'https://evil.invalid'},{callback_url:'https://evil.invalid'}])assert.throws(()=>assertBusinessImageParameters({...params,...extra},0));assert.throws(()=>assertBusinessImageParameters({...params,model:'gemini-3-pro-image'},0));});
test('current Wan grants are executable and documented Pro tiers appear only when granted',()=>{
  const base=['wan3.0-video','wan3.0-video-prime'];
  const pro=['wan3.0-video-pro','wan3.0-video-prime-pro'];
  const rows=ids=>buildBusinessModelCatalog({data:ids.map(id=>({id}))}).models;
  assert.deepEqual(new Set(rows(base).map(model=>model.id)),new Set(base));
  for(const model of rows([...base,...pro])) {
    assert.equal(model.dedicatedVideo.family,'wan3.0');
    assert.deepEqual(model.resolutions,pro.includes(model.id)?['1080p','2k','4k']:['480p','720p','1080p']);
    assert.equal(model.maxReferenceImages,10);
    assert.equal(model.maxSeconds,30);
  }
  for(const id of pro) assert.equal(isGenerationPickerModel(id),false);
});
test('reviewed Z-Image and Wan Spicy grants use exact settings, while the remaining grants stay pending',()=>{
  const spicy=['z-image-spicy','qwen-image-edit-spicy','face-swap-spicy','head-swap-spicy','wan2.2-i2v-spicy','wan2.7-i2v-spicy','wan3.0-video-spicy','wan3.0-video-prime-spicy','wan3.0-video-pro-spicy','wan3.0-video-prime-pro-spicy'];
  const omni='gemini-omni-1.1-flash-preview';
  const rows=buildBusinessModelCatalog({data:[...spicy,omni].map(id=>({id}))});
  assert.equal(rows.models.length,7);
  const z=rows.models.find(row=>row.id==='z-image-spicy');
  assert.equal(z.id,'z-image-spicy');
  assert.equal(z.nsfw,true);
  assert.equal(z.supportsReferences,false);
  assert.equal(z.maxImageCount,1);
  assert.equal(z.zImage.maxDimension,1536);
  assert.equal(z.zImage.defaultSize,'1024x1536');
  assert.equal(z.zImage.promptExtendSurcharged,true);
  assert.equal(isGenerationPickerModel(z.id),false);
  const wan22=rows.models.find(row=>row.id==='wan2.2-i2v-spicy');
  const wan27=rows.models.find(row=>row.id==='wan2.7-i2v-spicy');
  assert.deepEqual(wan22.secondsOptions,[5,8]);
  assert.deepEqual(wan22.resolutions,['480p','720p']);
  assert.equal(wan22.supportsAudio,false);
  assert.deepEqual(wan27.resolutions,['720p','1080p']);
  assert.equal(wan27.dedicatedVideo.defaultResolution,'1080p');
  for (const model of rows.models.filter(row=>row.id.startsWith('wan3.0-'))) {
    assert.equal(model.dedicatedVideo.family,'wan3.0');
    assert.deepEqual(model.resolutions,model.id.endsWith('-pro-spicy')?['1080p','2k','4k']:['480p','720p','1080p']);
    assert.equal(model.maxReferenceImages,10);
  }
  for (const row of rows.models) {
    assert.equal(row.nsfw,true);
    assert.equal(isGenerationPickerModel(row.id),false);
  }
  assert.equal(rows.unavailableModels.length,4);
  for(const row of rows.unavailableModels) {
    assert.equal(row.reason,'adapter_pending');
    assert.equal(row.nsfw,row.id!==omni);
    assert.equal(isGenerationPickerModel(row.id),false);
  }
  assert.equal(rows.unavailableModels.find(row=>row.id===omni).category,'video');
  const pro=buildBusinessModelCatalog({data:[{id:'z-image-spicy-pro'}]}).models[0];
  assert.equal(pro.id,'z-image-spicy-pro');
  assert.equal(pro.nsfw,true);
  assert.equal(pro.zImage.maxDimension,2560);
  assert.equal(isGenerationPickerModel(pro.id),false);
});
console.log(`Business model catalog/image: ${count} cases passed (${result.upstreamTotal} fixture IDs, ${result.models.length} executable contracts in the historical fixture).`);
