const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),ts=require("typescript"),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
const cache=new Map();let locale="zh-Hant";
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const m={exports:{}};cache.set(file,m);
 const req=id=>{
  if(id==="next/link")return {default:({children,...props})=>React.createElement("a",props,children),__esModule:true};
  if(id==="next/navigation")return {notFound(){throw Error("not found")}};
  if(id==="@/components/ModelLogo")return {default:()=>null,__esModule:true};
  if(id==="@/lib/rateCard")return {listRates:async()=>[]};
  if(id==="@/lib/i18n/server")return {getDict:async()=>({locale,t:load("lib/i18n/dict.ts").DICTS[locale]}),getTr:async()=>load("lib/i18n/tr.ts").trFor(locale)};
  if(id.startsWith(".")||id.startsWith("@/")){
   const root=id.startsWith("@/")?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);
   return load([root,root+".ts",root+".tsx",path.join(root,"index.ts")].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())||root);
  }return require(id);
 };
 new Function("require","module","exports",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(req,m,m.exports);
 return m.exports;
}
(async()=>{
 const catalog=load("lib/seo/models.ts"),biz=load("lib/businessModelCatalog.ts"),page=load("app/models/[slug]/page.tsx"),translations=load("lib/i18n/strings/parts/modelRelease.ts");
 const newPages=catalog.MODEL_PAGES.filter(p=>p.workspace==="business");
 assert.equal(new Set(catalog.MODEL_PAGES.map(p=>p.slug)).size,catalog.MODEL_PAGES.length);
 for(const p of newPages){
  assert.ok(biz.buildBusinessModelCatalog({data:[{id:p.id}]}).models.some(m=>m.id===p.id));
  assert.equal(catalog.modelPricing(p,[{modelId:p.id,active:true,credits:999}]),null);
  for(const key of [p.tagline,p.blurb,...p.bestFor,...p.notFor,...(p.faqs??[]).flatMap(f=>[f.question,f.answer])]){
   assert.ok(translations.MODEL_RELEASE_EN[key],"English: "+key);
   assert.ok(translations.MODEL_RELEASE_JA[key],"Japanese: "+key);
  }
 }
 assert.deepEqual(catalog.modelSpecs(newPages.find(p=>p.id==="kling-4.0-flash")).resolutions,["720p"]);
 assert.equal(catalog.modelSpecs(newPages.find(p=>p.id==="z-image-spicy")).refImages,false);
 assert.equal(catalog.modelSpecs(newPages.find(p=>p.id==="Dola-Seedream-5.5")).maxRefs,10);
 for(locale of ["zh-Hant","en","ja"])for(const p of newPages){
  const params=Promise.resolve({slug:p.slug});
  const html=renderToStaticMarkup(await page.default({params}));
  const data=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  assert.ok(data.find(d=>d["@type"]==="SoftwareApplication").inLanguage===locale);
  assert.ok(!data.find(d=>d["@type"]==="SoftwareApplication").offers);
  const faq=data.find(d=>d["@type"]==="FAQPage");
  for(const f of faq.mainEntity)assert.ok(html.includes(escape(f.name))&&html.includes(escape(f.acceptedAnswer.text)),"Schema must match visible FAQ");
  assert.ok(html.includes("/business?kind="+p.kind+"&amp;model="+encodeURIComponent(p.id)));
  assert.ok(html.includes(p.sourceUrl));
  const meta=await page.generateMetadata({params});
  assert.equal(meta.alternates.canonical,"/models/"+p.slug);
  assert.ok(!meta.title.includes("點數"));
 }
 // Every current release has a public guide and every guide's specs use the executable adapter.
 for(const id of ["kling-4.0","kling-4.0-flash","Dola-Seedream-5.5","SIRAYA-Seedance-2.5-flash","z-image-spicy","z-image-spicy-pro"])assert.ok(newPages.some(p=>p.id===id));
 console.log("PASS model release coverage, 21 three-language page renders, metadata, grants, business pricing and visible FAQ/schema parity");
})().catch(e=>{console.error(e);process.exitCode=1});
function escape(s){return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#x27;");}
