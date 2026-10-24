/** Local UI fixture for the REAL B and C workflow galleries.
 * No credentials, server APIs, provider requests or production writes.
 * node scripts/serve-workflow-gallery-qa.cjs [3142]
 * ?mode=business|consumer&lang=zh-Hant|en|ja&scenario=populated|empty|loading|error
 * Mutations only modify this tab's in-memory test data. Unlisted fetches fail closed.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const repo = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tbw-gallery-qa-'));
const port = Number(process.argv[2] || 3142);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local port');
const write = (name, body) => { const file = path.join(temporary, name); fs.writeFileSync(file, body); return file; };
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
const cssLoader = write('css-loader.cjs', `module.exports=function(source){const classes={},prefix='galleryqa_'+require('node:crypto').createHash('sha1').update(this.resourcePath).digest('hex').slice(0,8)+'_';source=source.replace(/\\.([a-zA-Z][\\w-]*)/g,(_,key)=>{classes[key]=prefix+key;return '.'+classes[key];});return 'const s=document.createElement("style");s.textContent='+JSON.stringify(source)+';document.head.append(s);export default '+JSON.stringify(classes)+';';};`);
const link = write('link.tsx', `import React from 'react'; export default function Link({children,onClick,...props}:any){return <a {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.__QA_NAV__=props.href;window.dispatchEvent(new Event('qa:navigate'));}}}>{children}</a>}`);
const image = write('image.tsx', 'import React from "react"; export default function Image({alt="",unoptimized,priority,fill,...props}:any){return <img alt={alt} {...props}/>}');
const navigation = write('navigation.ts', `const router={push:(url:string)=>{window.__QA_NAV__=url;window.dispatchEvent(new Event('qa:navigate'));},replace:(url:string)=>{window.__QA_NAV__=url;},refresh:()=>{}};export function useRouter(){return router};`);
const entry = write('entry.tsx', `
import React from 'react'; import {createRoot} from 'react-dom/client';
import BusinessWorkflows from '@/components/business/BusinessWorkflows';
import CanvasHomePage from '@/app/canvas/page';
import {LocaleProvider} from '@/lib/i18n/client';
import {OFFICIAL_CANVAS_TEMPLATES,builtinCanvasSummary} from '@/lib/canvas/officialTemplates';
const params=new URLSearchParams(location.search),lang=['zh-Hant','en','ja'].includes(params.get('lang'))?params.get('lang'):'zh-Hant',business=params.get('mode')!=='consumer',scenario=params.get('scenario')||'populated';
document.documentElement.lang=lang;document.title='Local workflow gallery QA';
const names=lang==='ja'?['青い羽根の、その先へ','雨の旧駅・三つのショット','光と素材の習作']:lang==='en'?['Beyond the blue feather','The old station in three shots','Studies in light and material']:['藍羽的下一個鏡頭','雨後舊驛站・三鏡敘事','光與材質的習作'];
let workflows=scenario==='empty'?[]:names.map((name,index)=>({id:business?'a1b2c3d4-1234-4567-890a-'+String(index+1).padStart(12,'0'):String(index+1),name,nodeCount:[3,7,5][index],updatedAt:['2026-10-24T04:20:00Z','2026-10-23T10:05:00Z','2026-10-21T01:30:00Z'][index]}));
const templates=OFFICIAL_CANVAS_TEMPLATES.slice(0,7).map(builtinCanvasSummary);
const posts=scenario==='empty'?[]:[{id:1,name:names[2],description:lang==='ja'?'光の変化から始める短い映像。':lang==='en'?'A short film that starts with a change of light.':'從光線的轉變，展開一段短片。',nodeCount:5,copyCount:2,authorName:'THE BLUE WING',isOwn:true,createdAt:'2026-10-23T10:00:00Z'}];
window.__QA_REQUESTS__=[];window.__QA_NAV__='';window.__QA_BLOCKED__=[];
window.fetch=async(input,init={})=>{
 const raw=typeof input==='string'?input:input.url;const parsed=new URL(raw,location.origin);const url=parsed.pathname;const method=init.method||'GET';
 window.__QA_REQUESTS__.push({url,method});
 if(parsed.origin!==location.origin){window.__QA_BLOCKED__.push(raw);throw Error('LOCAL QA blocks external requests');}
 const galleries=['/api/business/workflows','/api/canvas','/api/canvas/templates','/api/canvas/plaza'];
 if(method==='GET'&&galleries.includes(url)){
  if(scenario==='loading')return new Promise((resolve,reject)=>{init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
  if(scenario==='error')return Response.json({error:{message:'Local controlled load failure'}},{status:503});
  return Response.json(url==='/api/canvas/templates'?{templates:scenario==='empty'?[]:templates}:url==='/api/canvas/plaza'?{posts}:{workflows});
 }
 if(method==='GET'&&url==='/api/auth/me')return Response.json({user:{role:'member'}});
 if(method==='POST'&&(url==='/api/business/workflows'||url==='/api/canvas')){const data=JSON.parse(init.body||'{}');const id=business?'a1b2c3d4-1234-4567-890a-000000000099':'99';const workflow={id,name:data.name,nodeCount:data.graph?.nodes?.length||0,updatedAt:'2026-10-24T06:00:00Z'};workflows=[...workflows,workflow];return Response.json({workflow});}
 if(method==='DELETE'&&url.startsWith('/api/canvas/')){const id=url.split('/').at(-1);workflows=workflows.filter(row=>row.id!==id);return Response.json({ok:true});}
 if(method==='POST'&&/^\\/api\\/canvas\\/(templates|plaza)\\/-?\\d+\\/clone$/.test(url))return Response.json({workflowId:'99'});
 window.__QA_BLOCKED__.push({url,method});throw Error('LOCAL QA: unlisted API or paid generation blocked');
};
const models=[{id:'Dola-Seedream-5.0-lite',label:'Seedream 5.0 lite',modality:'image',supportsReferences:true,nsfw:false,sizes:['1024x1024']},{id:'SIRAYA-Seedance-2.5',label:'Seedance 2.5',modality:'video',supportsReferences:true,nsfw:false,seedance:{version:'2.5'},defaultSeconds:5,resolutions:['720p','1080p'],aspectRatios:['16:9']}];
createRoot(document.getElementById('root')).render(<LocaleProvider locale={lang}>{business?<main className="qa-business"><header className="qa-shell"><a href="/?mode=business">The Blue Wing</a><span>{lang==='ja'?'ビジネスワークスペース':lang==='en'?'Business workspace':'商務工作室'}</span><h1>{lang==='ja'?'ワークフロー':lang==='en'?'Workflows':'工作流'}</h1></header><div className="qa-business-inner"><BusinessWorkflows models={models}/></div></main>:<CanvasHomePage/>}</LocaleProvider>);
`);
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const compiler = webpack({ mode: 'development', devtool: false, context: repo, entry,
  output: { path: temporary, filename: 'bundle.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(repo, 'node_modules')], alias: { '@': repo, 'next/link$': link, 'next/image$': image, 'next/navigation$': navigation } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }, { test: /\.css$/, use: cssLoader }] },
  optimization: { minimize: false }, performance: { hints: false },
});
compiler.run((error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; compiler.close(() => {}); return; }
  const cssDirectory = path.join(repo, '.next/static/css');
  const css = fs.existsSync(cssDirectory) ? fs.readdirSync(cssDirectory).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(cssDirectory, file), 'utf8')).join('\n') : '';
  if (!css.trim()) throw Error('Run the production webpack build before the local gallery fixture; missing compiled CSS would make layout QA invalid.');
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4' };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1'); response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (url.pathname === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(path.join(temporary, 'bundle.js'))); return; }
    if (url.pathname === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); return; }
    if (url.pathname !== '/') {
      const base = url.pathname.startsWith('/_next/static/media/') ? path.join(repo, '.next/static/media') : path.join(repo, 'public');
      const relative = url.pathname.startsWith('/_next/static/media/') ? url.pathname.slice('/_next/static/media/'.length) : url.pathname.slice(1);
      let decoded; try { decoded = decodeURIComponent(relative); } catch { response.writeHead(400); response.end(); return; }
      const file = path.resolve(base, decoded), extension = path.extname(file).toLowerCase();
      if (!file.startsWith(base + path.sep) || !types[extension] || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', types[extension]); fs.createReadStream(file).pipe(response); return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body,#root{margin:0;min-height:100%;background:#101111;color:#f1f2ee}body{font-family:system-ui,sans-serif}.qa-shell{display:flex;gap:24px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #303434;padding:20px 36px}.qa-shell>a{color:#f1f2ee;font-size:16px}.qa-shell>span{color:#b9c0bb;font-size:13px}.qa-shell h1{margin:0 0 0 auto;font-size:20px;font-weight:400}.qa-business-inner{padding:32px 36px 48px}.qa-business *{box-sizing:border-box}@media(max-width:640px){.qa-shell{padding:16px 18px;gap:12px}.qa-shell h1{font-size:18px}.qa-shell>span{display:none}.qa-business-inner{padding:24px 18px 36px}}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  }).listen(port, '127.0.0.1', () => console.log(`LOCAL REAL GALLERIES http://127.0.0.1:${port}/?mode=business&lang=zh-Hant&scenario=populated — no paid generation, production APIs or credentials`));
  const close = () => { server.close(); compiler.close(() => process.exit(0)); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
});
