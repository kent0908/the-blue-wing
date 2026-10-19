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
  console.log(`PASS ${count} business provider isolation cases; no paid network calls`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);});
