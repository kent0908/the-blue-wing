const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
let monitoring = 0;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} }; cache.set(file, mod.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(id => id === './modelMonitoring' ? { monitoredModelFetch: async (url, init) => { monitoring++; return fetch(url, init); } } : id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id), mod, mod.exports);
  cache.set(file, mod.exports); return mod.exports;
}
const api = load('lib/siraya.ts');
const originalFetch = global.fetch;
const keys = ['SIRAYA_API_KEY','SIRAYA_API_KEY_2'];
const saved = keys.map(key => process.env[key]);
let count = 0;
async function check(name, fn) { await fn(); count++; console.log('PASS', name); }
(async () => {
  process.env.SIRAYA_API_KEY = 'platform-primary'; process.env.SIRAYA_API_KEY_2 = 'platform-backup';
  const own = { apiKey: 'sk-business-key-alice' };
  const invocations = [
    () => api.createImage({model:'SIRAYA-Dola-Seedream-5.0-pro',prompt:'A paper city'}, own),
    () => api.createImage({model:'NSFW-gpt-image-2',prompt:'A paper city',image:'https://example.com/image.png'}, own),
    () => api.createImageEdit({model:'gpt-image-2',prompt:'A paper city',image_urls:['https://example.com/image.png']}, own),
    () => api.createVideo({model:'SIRAYA-Seedance-2.5',prompt:'A paper city'}, own),
    () => api.createVideoFromDraft({model:'SIRAYA-Seedance-2.5',draft_task_id:'draft-example'}, own),
    () => api.createChatCompletion({model:'deepseek-v4.1-flash',messages:[{role:'user',content:'Hello'}]}, own),
    () => api.createChatCompletionStream({model:'deepseek-v4.1-flash',messages:[{role:'user',content:'Hello'}]}, own),
    () => api.getVideoStatus('job/owned', own),
    () => api.listModels(own),
  ];
  for (let i=0;i<invocations.length;i++) await check(`explicit credential path ${i+1} never uses platform key`, async()=>{
    let calls=0; monitoring=0;
    global.fetch=async (url, init)=>{calls++;assert.equal(init.headers.get('Authorization'),'Bearer '+own.apiKey);assert.equal(new URL(url).origin,'https://llm.siraya.ai');return Response.json({status:'completed',data:[]});};
    await invocations[i](); assert.equal(calls,1); assert.equal(monitoring,0);
  });
  for (const status of [400,401,402,403,404,429,500,502]) await check(`BYOK HTTP ${status} never retries platform credential`,async()=>{
    let calls=0;global.fetch=async(_url,init)=>{calls++;assert.equal(init.headers.get('Authorization'),'Bearer '+own.apiKey);return Response.json({error:{code:'insufficient_quota',message:'insufficient balance'}},{status});};
    await assert.rejects(()=>api.createVideo({model:'SIRAYA-Seedance-2.5',prompt:'A city'},own));assert.equal(calls,1);
  });
  await check('network uncertainty creates only one provider attempt',async()=>{let calls=0;global.fetch=async()=>{calls++;throw new TypeError('network');};await assert.rejects(()=>api.createVideo({model:'x',prompt:'A city'},own));assert.equal(calls,1);});
  for (const invalid of [{apiKey:''},{apiKey:'bad\r\nsecret'},{},null]) await check('invalid explicit credentials fail closed',async()=>{let calls=0;global.fetch=async()=>{calls++;return Response.json({});};await assert.rejects(()=>api.listModels(invalid),api.SirayaConfigError);assert.equal(calls,0);});
  await check('concurrent business accounts keep independent credentials', async()=>{
    const seen=[];global.fetch=async(_url,init)=>{const body=JSON.parse(init.body);await new Promise(resolve=>setTimeout(resolve,body.prompt==='alice'?8:1));seen.push([body.prompt,init.headers.get('Authorization')]);return Response.json({data:[]});};
    await Promise.all(['alice','bob','alice','bob'].map(name=>api.createImage({model:'SIRAYA-Dola-Seedream-5.0-pro',prompt:name},{apiKey:`sk-business-key-${name}`})));
    assert.equal(seen.length,4);for(const [name,key] of seen)assert.equal(key,`Bearer sk-business-key-${name}`);
  });
  await check('consumer calls still use platform monitoring and primary key',async()=>{monitoring=0;global.fetch=async(_url,init)=>{assert.equal(init.headers.get('Authorization'),'Bearer platform-primary');return Response.json({data:[]});};await api.createImage({model:'SIRAYA-Dola-Seedream-5.0-pro',prompt:'A city'});assert.equal(monitoring,1);});
  await check('BYOK POST captures only safe transport receipt before success parsing',async()=>{const seen=[];global.fetch=async()=>Response.json({id:'asynchronous-task',data:[]},{headers:{'X-Request-Id':'8da1bafc-0123-4567-8901-123456789abc','X-Secret':'never-forward'}});await api.createVideo({model:'SIRAYA-Seedance-2.5',prompt:'A city'},{...own,onRequestMetadata:metadata=>seen.push(metadata)});assert.deepEqual(seen,[{requestId:'8da1bafc-0123-4567-8901-123456789abc',httpStatus:200}]);});
  await check('HTTP rejection preserves receipt without exposing provider error text',async()=>{const seen=[];global.fetch=async()=>Response.json({error:{message:'private provider prose'}},{status:429,headers:{'x-request-id':'receipt-rejected'}});await assert.rejects(()=>api.createVideo({model:'SIRAYA-Seedance-2.5',prompt:'A city'},{...own,onRequestMetadata:metadata=>seen.push(metadata)}));assert.deepEqual(seen,[{requestId:'receipt-rejected',httpStatus:429}]);});
  await check('unsafe or missing request headers never become public receipt IDs',async()=>{for(const value of [undefined,'sk-private-secret-placeholder','csk-console-secret-placeholder','a'.repeat(161),'contains unsafe space']){const seen=[];global.fetch=async()=>Response.json({data:[]},{headers:value?{'x-request-id':value}:{}});await api.createImage({model:'gpt-image-2',prompt:'A city'},{...own,onRequestMetadata:metadata=>seen.push(metadata)});assert.deepEqual(seen,[{requestId:null,httpStatus:200}]);}});
  await check('GET, network uncertainty and receipt callback failure cannot create paid retries',async()=>{let calls=0,metadataCalls=0;global.fetch=async()=>{calls++;return Response.json({data:[]},{headers:{'x-request-id':'read-only-receipt'}})};await api.listModels({...own,onRequestMetadata:()=>metadataCalls++});assert.equal(metadataCalls,0);await api.createImage({model:'gpt-image-2',prompt:'A city'},{...own,onRequestMetadata:()=>{throw Error('receipt writer unavailable')}});assert.equal(calls,2);global.fetch=async()=>{throw new TypeError('network')};await assert.rejects(()=>api.createImage({model:'gpt-image-2',prompt:'A city'},{...own,onRequestMetadata:()=>metadataCalls++}));assert.equal(metadataCalls,0);});
  await check('exact BYOK video builder survives transport without C adapters or extra watermark fields',async()=>{const payload={model:'wan2.7-r2v',prompt:'A blue crane',resolution:'720P',watermark:false,seconds:5,input_references:[{role:'reference_image',url:'https://owned.invalid/a.png'}]};let calls=0;global.fetch=async(_url,init)=>{calls++;assert.deepEqual(JSON.parse(init.body),payload);assert.equal(init.headers.get('Authorization'),'Bearer '+own.apiKey);return Response.json({data:[]});};await api.createBusinessVideo(payload,own);assert.equal(calls,1);await assert.rejects(()=>api.createBusinessVideo(payload),api.SirayaConfigError);assert.equal(calls,1)});
  await check('BYOK GPT image edit honors JPEG compression while C image edits preserve PNG behavior',async()=>{const formats=[];global.fetch=async(_url,init)=>{const body=JSON.parse(init.body);formats.push(body.output_format);if(body.output_format==='jpeg')assert.equal(body.output_compression,75);return Response.json({data:[]});};const payload={model:'gpt-image-2.5-flare',prompt:'A blue crane',image:'https://owned.invalid/a.png',output_format:'jpeg',output_compression:75};await api.createImage(payload,own);await api.createImage(payload);assert.deepEqual(formats,['jpeg','png'])});
  console.log(`PASS ${count} business provider isolation cases; no paid network calls`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);});
