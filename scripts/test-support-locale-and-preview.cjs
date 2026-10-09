const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const cache=new Map(),state=[];let cursor=0,locale='ja';
const hooks={...React,useEffect(){},useRef:()=>({current:null}),useState(initial){const i=cursor++;if(!(i in state))state[i]=i===0?true:typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];}};
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(id=>{
  if(id==='react')return hooks;
  if(id==='next/navigation')return {usePathname:()=>'/studio'};
  if(id==='@/lib/i18n/client')return {useTr:()=>load('lib/i18n/tr.ts').trFor(locale)};
  if(id.startsWith('@/'))return resolve(id.slice(2));
  if(id.startsWith('.'))return resolve(path.join(path.dirname(file),id));
  return require(id);
},m,m.exports);cache.set(file,m.exports);return m.exports;}
function resolve(base){return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts');}
const Support=load('components/SupportChat.tsx').default,{FAQ_CATEGORIES}=load('lib/supportFaq.ts'),{translate}=load('lib/i18n/tr.ts');
const encoded=value=>renderToStaticMarkup(React.createElement(React.Fragment,null,value));
function render(){cursor=0;const element=Support();return {element,html:renderToStaticMarkup(element)};}
function buttons(node,out=[]){if(!node||typeof node!=='object')return out;if(node.type==='button')out.push(node);for(const child of React.Children.toArray(node.props?.children))buttons(child,out);return out;}
const category=FAQ_CATEGORIES[0],question=category.entries[0];
let view=render();assert.ok(view.html.includes(encoded(translate('ja',category.label))));
buttons(view.element).find(b=>renderToStaticMarkup(b).includes(encoded(translate('ja',category.label)))).props.onClick();view=render();assert.ok(view.html.includes(encoded(translate('ja',question.question))));
for(const next of ['en','zh-Hant','ja']){locale=next;view=render();assert.ok(view.html.includes(encoded(translate(next,category.label))));assert.ok(view.html.includes(encoded(translate(next,question.question))));if(next!=='ja')assert.ok(!view.html.includes(encoded(translate('ja',question.question))));}
locale='zh-Hant';view=render();buttons(view.element).find(b=>renderToStaticMarkup(b).includes(question.question)).props.onClick();
for(const next of ['en','ja','zh-Hant']){locale=next;view=render();assert.ok(view.html.includes(encoded(translate(next,question.answer))));assert.ok(!view.html.includes('{c}'));}
console.log('PASS real SupportChat state survives locale changes: categories, questions, answers, and follow-up labels in zh/en/ja');
const {fitMaskPreview}=load('lib/layerPreview.ts');
let count=0;for(const viewport of [[320,640],[390,844],[768,1024],[1024,768],[1920,1080]])for(const image of [[1920,1080],[1080,1920],[4096,4096],[1,1]]){
  const {w,h}=fitMaskPreview(...image,...viewport);assert.ok(w>=1&&h>=1);assert.ok(w<=image[0]&&h<=image[1]);assert.ok(w<=viewport[0]-(viewport[0]>=1024?482:32));assert.ok(h<=viewport[1]);count++;
}
assert.deepEqual(fitMaskPreview(0,0,10,10),{w:1,h:1});
console.log(`PASS ${count} real preview size combinations; narrow/mobile widths remain positive and within available space`);
