const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;}
const {IMAGE_MODELS}=load('lib/imageModels.ts'),{applyWatermarkDefaults,supportsImageWatermark,supportsVideoWatermark}=load('lib/watermark.ts');
let assertions=0;const check=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++};
(async()=>{
const oldFetch=global.fetch,oldKey=process.env.SIRAYA_API_KEY,sent=[];
try{
 process.env.SIRAYA_API_KEY='mock-only-not-a-credential';global.fetch=async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({data:[]})}};
 const api=load('lib/siraya.ts');
 for(const entry of IMAGE_MODELS){for(const model of [entry.id,'NSFW-'+entry.id]){await api.createImage({model,prompt:'payload regression'});const b=sent.at(-1).body;check(b.watermark,entry.family==='seedream'?false:undefined);check(b.model,model);check(b.extra_body,undefined)}}
 for(const model of ['seedream-5-0-pro-260628','dola-seedream-5-0-pro-260628','NSFW-SIRAYA-Dola-Seedream-5.0-pro']){check(supportsImageWatermark(model),true);await api.createImage({model,prompt:'test'});check(sent.at(-1).body.watermark,false)}
 for(const model of ['SIRAYA-Seedance-1.0-pro','Seedance-1.5-pro','Seedance-2.0-mini','Seedance-2.0','NSFW-SIRAYA-Seedance-2.5','seedance-2-0-mini-260428']){check(supportsVideoWatermark(model),true);await api.createVideo({model,prompt:'test'});check(sent.at(-1).body.extra_body,{watermark:false});await api.createVideo({model,prompt:'test',extra_body:{watermark:true}});check(sent.at(-1).body.extra_body,{watermark:true})}
 for(const model of ['gpt-image-2','gemini-3-pro-image','imagen-4.0-generate-001','unknown']){await api.createImage({model,prompt:'test',watermark:true,extra_body:{watermark:true}});check(sent.at(-1).body.watermark,undefined);check(sent.at(-1).body.extra_body,undefined)}
 for(const model of ['veo-3.1','sora-2','wan-2.6','unknown']){await api.createVideo({model,prompt:'test',extra_body:{watermark:true}});check(sent.at(-1).body.extra_body,undefined)}
 await api.createImageEdit({model:'Dola-Seedream-5.0-pro',prompt:'test',image_urls:['mock-image']});check(sent.at(-1).body.extra_body,{watermark:false});check(sent.at(-1).body.output_format,'png');check(sent.at(-1).body.watermark,undefined);
 const input={model:'Dola-Seedream-5.0-pro',watermark:true,extra_body:{guidance_scale:3}};check(applyWatermarkDefaults(input,'image').watermark,true);check(input.extra_body,{guidance_scale:3});check(applyWatermarkDefaults(input,'image').extra_body,{guidance_scale:3});
 console.log(`PASS ${assertions} watermark assertions; ${sent.length} mocked final outbound requests; no network or credits.`);
}finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.SIRAYA_API_KEY;else process.env.SIRAYA_API_KEY=oldKey}
})().catch(e=>{console.error(e);process.exitCode=1});
