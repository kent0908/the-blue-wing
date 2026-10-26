/** Real homepage / IndustryCreativeHub UI on localhost only.
 * node scripts/serve-industry-home-qa.cjs [3145]
 * ?lang=zh-Hant|en|ja&view=home|hub
 * Compiles current source/CSS in a temporary folder, never a Next production build.
 * Navigation is captured in window.__QA_NAV__; all unlisted API calls fail closed.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tbw-industry-qa-'));
const port = Number(process.argv[2] || 3145);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local port');
const write = (name, body) => { const file = path.join(temporary, name); fs.writeFileSync(file, body); return file; };
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
// Scope selectors only. Replacing every .word would corrupt .woff2 / .jpg URL suffixes.
const cssLoader = write('css-loader.cjs', `const postcss=require(${JSON.stringify(require.resolve('postcss'))});module.exports=function(source){const classes={},prefix='industryqa_'+require('node:crypto').createHash('sha1').update(this.resourcePath).digest('hex').slice(0,8)+'_';const parsed=postcss.parse(source);parsed.walkRules(rule=>{rule.selector=rule.selector.replace(/\\.([a-zA-Z][\\w-]*)/g,(_,key)=>{classes[key]=prefix+key;return '.'+classes[key];});});return 'const s=document.createElement("style");s.textContent='+JSON.stringify(parsed.toString())+';document.head.append(s);export default '+JSON.stringify(classes)+';';};`);
const navigation = write('navigation.ts', `const router={push:(href:string)=>{window.__QA_NAV__=href;window.dispatchEvent(new Event('qa:navigate'));},replace:(href:string)=>{window.__QA_NAV__=href;window.dispatchEvent(new Event('qa:navigate'));},refresh:()=>{}};export function useRouter(){return router};export function useSearchParams(){return new URLSearchParams(location.search)};export function usePathname(){return location.pathname};`);
const link = write('link.tsx', `import React from 'react';export default function Link({children,onClick,...props}:any){return <a {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.__QA_NAV__=props.href;window.dispatchEvent(new Event('qa:navigate'));}}}>{children}</a>}`);
const image = write('image.tsx', `import React from 'react';export default function Image({alt='',unoptimized,priority,fill,fetchPriority,...props}:any){return <img alt={alt} fetchPriority={fetchPriority} {...props}/>}`);
const entry = write('entry.tsx', `
import React from 'react';import {createRoot} from 'react-dom/client';
import HomePage from '@/app/page';import IndustryCreativeHub from '@/components/IndustryCreativeHub';import {LocaleProvider} from '@/lib/i18n/client';
const params=new URLSearchParams(location.search),locale=['zh-Hant','en','ja'].includes(params.get('lang'))?params.get('lang'):'zh-Hant';
document.documentElement.lang=locale;document.title='Local industry homepage QA';
window.__QA_NAV__='';window.__QA_REQUESTS__=[];window.__QA_BLOCKED__=[];
window.fetch=async(input,init={})=>{const raw=typeof input==='string'?input:input.url;const parsed=new URL(raw,location.origin),method=init.method||'GET';window.__QA_REQUESTS__.push({url:parsed.pathname,method});if(parsed.origin===location.origin&&parsed.pathname==='/api/home-blocks'&&method==='GET')return Response.json({hero:[],showcase:[],template:[]});window.__QA_BLOCKED__.push({url:parsed.href,method});throw Error('LOCAL QA blocks unlisted APIs and paid generation');};
window.confirm=()=>{throw Error('LOCAL QA: native confirm is blocked');};window.prompt=()=>{throw Error('LOCAL QA: native prompt is blocked');};
createRoot(document.getElementById('root')).render(<LocaleProvider locale={locale}>{params.get('view')==='hub'?<main style={{padding:'clamp(18px,4vw,56px)'}}><IndustryCreativeHub/></main>:<HomePage/>}</LocaleProvider>);
`);
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const compiler = webpack({ mode: 'development', devtool: false, context: root, entry, output: { path: temporary, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: { '@': root, 'next/link$': link, 'next/image$': image, 'next/navigation$': navigation } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }, { test: /\.css$/, use: cssLoader }] }, optimization: { minimize: false }, performance: { hints: false } });
async function start() {
  for (const file of ['components/IndustryCreativeHub.tsx', 'lib/industrySkills.ts']) if (!fs.existsSync(path.join(root, file))) throw Error('Product source is not ready: ' + file);
  const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss');
  const globalFile = path.join(root, 'app/globals.css');
  const globalCss = await postcss([tailwind({ optimize: false })]).process(fs.readFileSync(globalFile, 'utf8'), { from: globalFile });
  const stats = await new Promise((resolve, reject) => compiler.run((error, result) => error ? reject(error) : result.hasErrors() ? reject(Error(result.toString({ all: false, errors: true }))) : resolve(result)));
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm' };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1'); response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (url.pathname === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(path.join(temporary, 'bundle.js'))); return; }
    if (url.pathname === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(globalCss.css); return; }
    if (url.pathname !== '/') {
      const base = path.join(root, 'public'); let decoded;
      try { decoded = decodeURIComponent(url.pathname.slice(1)); } catch { response.writeHead(400); response.end(); return; }
      const file = path.resolve(base, decoded), type = types[path.extname(file).toLowerCase()];
      if (!file.startsWith(base + path.sep) || !type || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', type); const size = fs.statSync(file).size;
      if (type.startsWith('video/')) {
        response.setHeader('Accept-Ranges', 'bytes');
        if (request.headers.range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
          const start = match ? Number(match[1]) : -1, end = match?.[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
          if (start < 0 || start >= size || end < start) { response.writeHead(416, { 'Content-Range': 'bytes */' + size }); response.end(); return; }
          response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1 }); fs.createReadStream(file, { start, end }).pipe(response); return;
        }
      }
      response.setHeader('Content-Length', size); fs.createReadStream(file).pipe(response); return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body,#root{margin:0;min-height:100%;background:#090c0c;color:#eee}#root{height:100dvh}*,*::before,*::after{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  }).listen(port, '127.0.0.1', () => console.log(`LOCAL REAL INDUSTRY UI http://127.0.0.1:${port}/?lang=zh-Hant&view=home — source CSS, no production APIs or paid generation (${stats.hash})`));
  const close = () => { server.close(); compiler.close(() => process.exit(0)); }; process.on('SIGINT', close); process.on('SIGTERM', close);
}
start().catch(error => { console.error(error); compiler.close(() => { process.exitCode = 1; }); });
