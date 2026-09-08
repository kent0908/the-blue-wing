const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const cache=new Map();let lastSql='',lastValues=[],puts=0;
function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='@/lib/apiauth'?{requireUser:async()=>({user:{id:7}})}:id==='@/lib/db'?{sql:async(strings,...values)=>{lastSql=strings.join('?');lastValues=values;return{rows:lastSql.includes('insert into')?[{id:1,user_id:7,pathname:'p',filename:'test.mp4',content_type:'video/mp4',size:3}]:[]};}}:id==='@vercel/blob'?{put:async()=>{puts++;return{url:'https://blob.example/test',pathname:'test'};}}:id==='@/lib/assets'?load('lib/assets.ts'):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;}
process.env.BLOB_READ_WRITE_TOKEN='test-only';const route=load('app/api/assets/route.ts');
(async()=>{
 await route.GET(new NextRequest('https://test.local/api/assets'));assert.ok(lastSql.includes("content_type like 'image/%'"));assert.deepEqual(lastValues,[7,false]);
 await route.GET(new NextRequest('https://test.local/api/assets?media=all'));assert.deepEqual(lastValues,[7,true]);
 const upload=async(type,size=3)=>{const form=new FormData();form.append('file',new File([new Uint8Array(size)],'test.bin',{type}));return route.POST(new NextRequest('https://test.local/api/assets',{method:'POST',body:form}));};
 for(const type of ['video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4'])assert.equal((await upload(type)).status,201);
 const before=puts;assert.equal((await upload('application/javascript')).status,400);assert.equal((await upload('video/mp4',4*1024*1024+1)).status,400);assert.equal(puts,before);
 console.log('PASS assets media: default image-only query, opt-in full library, video/audio MIME upload, rejected type and 4MB cap before storage.');
})().catch(e=>{console.error(e);process.exitCode=1;});
