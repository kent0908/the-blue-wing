// Explicit, bounded live smoke tests. Never resubmits an existing case.
// Credentials remain in process memory; reports contain no credentials or signed URLs.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const dir=path.resolve(process.cwd(),'../verification-20261007');fs.mkdirSync(dir,{recursive:true});
const reportPath=path.join(dir,'wan-jobs.private.json');
const jobs=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):{};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(jobs,null,2));
const cache=new Map();
function load(f){f=path.resolve(f);if(cache.has(f))return cache.get(f).exports;const m={exports:{}};cache.set(f,m);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='./modelMonitoring'?{monitoredModelFetch:fetch}:id.startsWith('.')?load(path.resolve(path.dirname(f),id+'.ts')):require(id),m,m.exports);return m.exports;}
const api=load('lib/siraya.ts');
const image='https://thebluewing.studio/home-films/worlds.jpg';
const base={model:'wan3.0-video',prompt:'A single blue feather floats gently above a still sea at sunrise. One locked wide shot, natural soft light, no text or logos. Quiet waves and a brief soft piano note.',seconds:2,resolution:'720p',aspect_ratio:'16:9',async:true,prompt_extend:false,generate_audio:true};
const cases={
 'text-720':base,
 'text-480':{...base,resolution:'480p'},
 'image-1080':{...base,resolution:'1080p',generate_audio:false,frame_images:[{frame_type:'first_frame',image_url:image}]},
 'frames-720':{...base,frame_images:[{frame_type:'first_frame',image_url:image},{frame_type:'last_frame',image_url:image}]},
 'reference-prime':{...base,model:'wan3.0-video-prime',input_references:[{type:'image',url:image}]},
};
(async()=>{
const arg=process.argv[2];
if(arg==='submit'){
 const name=process.argv[3];if(!cases[name])throw Error('Unknown case');if(jobs[name])throw Error('Case already submitted; poll instead');
 jobs[name]={state:'submitting',createdAt:new Date().toISOString(),request:cases[name]};save();
 try{const j=await api.createVideo(cases[name]);jobs[name]={...jobs[name],id:j.id,state:j.status||'unknown',response:j};save();console.log(JSON.stringify({case:name,status:j.status,accepted:!!j.id,error:j.error}));}
 catch(e){jobs[name]={...jobs[name],state:'rejected',http:e.status,error:e.message};save();console.log(JSON.stringify({case:name,http:e.status,error:e.message}));}
}else if(arg==='poll'){
 for(const [name,job]of Object.entries(jobs)){if(!job.id||['failed','downloaded'].includes(job.state))continue;
 const j=await api.getVideoStatus(job.id);job.state=j.status;job.response=j;save();
 const url=j.output_url||j.data?.[0]?.url;
 if(j.status==='completed'&&url){const r=await fetch(url);if(!r.ok)throw Error('Result download '+r.status);fs.writeFileSync(path.join(dir,name+'.mp4'),Buffer.from(await r.arrayBuffer()));job.state='downloaded';save();}
 console.log(JSON.stringify({case:name,status:job.state,resolution:j.resolution,seconds:j.seconds,fps:j.vendor_data?.fps,error:j.error}));
 }
}else throw Error('Use submit <case> or poll');
})().catch(e=>{console.error(e.message);process.exitCode=1});
