/** Local-only, no-credentials fixture for exercising the real CanvasEditor.
 * node scripts/serve-canvas-connection-qa.cjs [port]
 * ?mode=consumer&lang=en exercises the original UI; default is a BYOK fixture.
 * All API calls are intercepted in-page; paid requests always throw.
 * No application route, database connection, or provider call is created.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const repo = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tbw-canvas-qa-'));
const port = Number(process.argv[2] || 3139);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local port');
const write = (name, body) => { const file = path.join(temporary, name); fs.writeFileSync(file, body); return file; };
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
const cssLoader = write('css-loader.cjs', `module.exports=function(source){const classes={};const prefix='qa_'+require('node:crypto').createHash('sha1').update(this.resourcePath).digest('hex').slice(0,8)+'_';source=source.replace(/\\.([a-zA-Z][\\w-]*)/g,(_,key)=>{classes[key]=prefix+key;return '.'+classes[key];});return 'const s=document.createElement("style");s.textContent='+JSON.stringify(source)+';document.head.append(s);export default '+JSON.stringify(classes)+';';};`);
const empty = write('empty.tsx', 'export default function Empty(){return null}');
const link = write('link.tsx', 'import React from "react"; export default function Link({children,...props}:any){return <a {...props}>{children}</a>}');
const image = write('image.tsx', 'import React from "react"; export default function Image({alt="",...props}:any){return <img alt={alt} {...props}/>}');
const entry = write('entry.tsx', `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Editor from ${JSON.stringify(path.join(repo, 'components/canvas/CanvasEditor.tsx').replace(/\\/g, '/'))};
import {LocaleProvider} from '@/lib/i18n/client'; import {defaultNodeData} from '@/lib/canvas/types';
const params=new URLSearchParams(location.search),lang=params.get('lang')||'zh-Hant',consumer=params.get('mode')==='consumer';
document.documentElement.lang=lang;
const graph={nodes:[
 {id:'text',type:'text',x:0,y:0,data:{text:'An original cobalt feather',title:'Text'}},
 {id:'imageA',type:'image',x:350,y:0,data:{...defaultNodeData('image'),title:'Image A'}},
 {id:'imageB',type:'image',x:700,y:0,data:{...defaultNodeData('image'),title:'Image B'}},
 {id:'reference',type:'loadImage',x:0,y:290,data:{items:[],title:'Reference'}},
 {id:'video',type:'video',x:700,y:330,data:{...defaultNodeData('video'),title:'Video'}}
],edges:[{id:'text-a',fromNode:'text',fromPort:'out',toNode:'imageA',toPort:'prompt'},{id:'reference-a',fromNode:'reference',fromPort:'out',toNode:'imageA',toPort:'image'},{id:'a-b',fromNode:'imageA',fromPort:'out',toNode:'imageB',toPort:'image'}]};
if(params.get('scenario')==='empty'){graph.nodes=[];graph.edges=[];}
if(params.get('scenario')==='text'){graph.nodes=graph.nodes.filter(node=>node.type==='text');graph.edges=[];}
const requests=[];window.fetch=async(input,init={})=>{
 const url=String(input);requests.push({url,method:init.method||'GET',body:init.body?JSON.parse(String(init.body)):null});
 document.getElementById('requests').textContent=JSON.stringify(requests);
 if(url==='/api/rates')return Response.json({rates:[{modelId:'ByteDance-Seedream-4.0',modality:'image',credits:12},{modelId:'SIRAYA-Seedance-2.0-mini',modality:'video',credits:15}]});
 if(url==='/api/models')return Response.json({models:[]});
 if(url==='/api/assets')return Response.json({assets:[]});
 if(init.method==='PUT')return Response.json({workflow:{id:'local-qa',version:'fixture-v2'}});
 throw Error('LOCAL QA: external and paid requests are blocked');
};
const runtime={kind:'business',apiBasePath:'/api/business/workflows',backHref:'/?mode=business',backLabel:'Local BYOK fixture',billingNotice:'LOCAL UI FIXTURE — NO PROVIDER, DATABASE OR PAID GENERATION',initialView:'canvas',showDirector:false,allowedNodeTypes:['text','loadImage','image','video','director3d'],videoModels:[],defaultNodeData,
 renderNodeSettings:(node,onChange)=>['loadImage','image','video'].includes(node.type)?<div style={{minHeight:node.type==='loadImage'?70:150}}><label>Local settings<textarea aria-label={'Settings '+node.id} style={{width:'100%',background:'#222',border:'1px solid #444',borderRadius:4,padding:8}} value={String(node.data.prompt||'')} onChange={e=>onChange({prompt:e.target.value})}/></label></div>:undefined,
 runNode:async()=>{throw Error('LOCAL QA: generation blocked')},confirmRun:()=>false};
createRoot(document.getElementById('root')).render(<LocaleProvider locale={lang}><Editor workflowId="local-qa" initialName="藍羽 · 下一個鏡頭" initialGraph={graph} initialVersion="fixture-v1" runtime={consumer?undefined:runtime}/></LocaleProvider>);
`);
const bundled = require('next/dist/compiled/webpack/webpack');
const webpack = bundled.webpack;
const compiler = webpack({ mode: 'development', devtool: false, context: repo, entry, output: { path: temporary, filename: 'bundle.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(repo, 'node_modules')], alias: {
    '@': repo, 'next/link$': link, 'next/image$': image,

    [path.join(repo, 'components/canvas/director3d/Director3DPanel.tsx')]: empty,
  } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }, { test: /\.css$/, use: cssLoader }] },
  plugins: [new webpack.NormalModuleReplacementPlugin(/(?:^|[/\\])(?:Director3DPanel)$/, empty)],
  optimization: { minimize: false }, performance: { hints: false },
});
compiler.run((error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; compiler.close(() => {}); return; }
  const directory = path.join(repo, '.next/static/css');
  const css = fs.existsSync(directory) ? fs.readdirSync(directory).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n') : '';
  if (!css.trim()) throw Error('Run the production webpack build before the local UI fixture; missing compiled CSS would make layout QA invalid.');
  const types = { '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2' };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
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
    response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body,#root{height:100%;margin:0;background:#090909;color:white}body{font-family:system-ui}#requests{position:fixed;right:8px;bottom:2px;max-width:350px;font-size:9px;pointer-events:none}</style></head><body><div id="root"></div><output id="requests" hidden></output><script src="/bundle.js"></script></body></html>');
  }).listen(port, '127.0.0.1', () => console.log(`LOCAL UI FIXTURE http://127.0.0.1:${port}/ — no paid generation, no database writes`));
  const close = () => { server.close(); compiler.close(() => process.exit(0)); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
});
