const fs=require('fs'),ts=require('typescript'),assert=require('assert/strict');
const {NextRequest,NextResponse}=require('next/server');
function load(f,mocks){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
class ApiError extends Error{constructor(status,message){super(message);this.status=status}}
const layers=load('lib/layerDecomposition.ts',{'./siraya':{SirayaApiError:ApiError}});
let passed=0;function test(n,f){f();passed++;console.log('PASS '+n)}
const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(1024,16);png.writeUInt32BE(1024,20);const image='data:image/png;base64,'+png.toString('base64');
const base={url:'https://provider/base',z_index:0,size:'1024x1024',output_format:'jpeg'};
const layer={url:'https://provider/layer',z_index:1,size:'300x400',output_format:'png',name:'Object',description:'Foreground',bounding_box:{absolute:[10,20,309,419],normalized:[10,20,302,409]}};
test('diagnostics omit content and signed URLs',()=>{const shape=JSON.stringify(layers.layerResponseShape([{...base,name:'PRIVATE_NAME',description:'PRIVATE_DESCRIPTION',url:'https://private/signed?token=SECRET',b64_json:'PRIVATE_BASE64'}]));assert.ok(!shape.includes('PRIVATE_'));assert.ok(!shape.includes('SECRET'));assert.ok(!shape.includes('https://'));});
test('valid source dimensions',()=>assert.deepEqual(layers.validateLayerInput(image),{width:1024,height:1024}));
test('URL source requires owned import',()=>assert.throws(()=>layers.validateLayerInput('https://example.com/a.png')));
test('small source rejected',()=>{const p=Buffer.from(png);p.writeUInt32BE(10,16);assert.throws(()=>layers.validateLayerInput('data:image/png;base64,'+p.toString('base64')))});
test('valid provider base metadata can omit box and name',()=>assert.equal(layers.parseLayerResponse([layer,base])[0].z_index,0));
test('ordinary image response rejected',()=>assert.throws(()=>layers.parseLayerResponse([{url:'https://provider/image'}])));
test('duplicate z index rejected',()=>assert.throws(()=>layers.parseLayerResponse([base,layer,layer])));
test('missing geometry rejected',()=>assert.throws(()=>layers.parseLayerResponse([base,{...layer,bounding_box:null}])));
test('other model rejected',()=>assert.throws(()=>layers.validateLayerRequest({model:'seedream-4-0',layer_decomposition:true,assetIds:[1]})));
test('multiple inputs rejected',()=>assert.throws(()=>layers.validateLayerRequest({model:'Seedream-5.0-pro',layer_decomposition:true,assetIds:[1,2]})));
let paid=0,refunds=0,settled=0,upstream=[base,layer],persistent=true,calledPayload;
const mocks={'@/lib/layerCapability':{LAYER_DECOMPOSITION_AVAILABLE:true},'@/lib/layerDecomposition':layers,'@/lib/layerSets':{saveLayerSet:async()=> 'layer-id'},'@/lib/companionGenerationAccess':{assertModelAccess(){}},'@/lib/generationValidation':{validateGeneration:b=>layers.validateLayerRequest(b)},'@/lib/creditTransactions':{paidCall:async(u,c,k,r,fn)=>{paid++;assert.equal(c,612);try{return {result:await fn('charge'),chargeId:'charge'}}catch(e){refunds++;throw e}},refundCharge:async()=>{refunds++},settleCharge:async(u,id,c)=>{settled=c;return 612-c}},'@/lib/siraya':{SirayaApiError:ApiError,createImage:async p=>{calledPayload=p;return {data:upstream}}},'@/lib/errors':{errorResponse:e=>NextResponse.json({error:e.message},{status:e.status??500})},'@/lib/apiauth':{requireUser:async()=>({user:{id:1}})},'@/lib/credits':{creditCost:async x=>x.imageCount*36,getBalance:async()=>1000},'@/lib/assetData':{assetsToDataUrls:async()=>[image]},'@/lib/mediaStore':{persistGeneratedMedia:async u=>persistent?'/api/media/generations/1/'+u.split('/').pop():u},'@/lib/imageModels':{MAX_REF_IMAGES:10},'@/lib/generations':{recordGeneration:async()=>{}},'@/lib/watermark':{applyWatermarkDefaults:b=>({...b,watermark:false})},'@/lib/imageMime':{sniffImageMimeFromBase64:()=> 'image/png'}};
const route=load('app/api/images/route.ts',mocks);const body={model:'Seedream-5.0-pro',prompt:'',assetIds:[1],layer_decomposition:true,size:'2K',confirmedMaxCredits:612};const request=b=>route.POST(new NextRequest('https://example.com/api/images',{method:'POST',body:JSON.stringify(b)}));
(async()=>{
const gatedRoute=load('app/api/images/route.ts',{...mocks,'@/lib/layerCapability':{LAYER_DECOMPOSITION_AVAILABLE:false,LAYER_DECOMPOSITION_UNAVAILABLE_REASON:'Unavailable'}});
const gated=await gatedRoute.POST(new NextRequest('https://example.com/api/images',{method:'POST',body:JSON.stringify(body)}));
assert.equal(gated.status,503);assert.equal((await gated.json()).error.code,'layer_metadata_unavailable');assert.equal(paid,0);assert.equal(calledPayload,undefined);console.log('PASS disabled layer API rejects before charge and provider');
let r=await request({...body,confirmedMaxCredits:36});assert.equal(r.status,409);assert.equal(paid,0);console.log('PASS changed maximum rejected before paid I/O');passed++;
r=await request(body);const result=await r.json();assert.equal(r.status,200);assert.equal(result.creditsSpent,72);assert.equal(result.creditsRefunded,540);assert.equal(settled,72);assert.equal(result.layers.length,2);assert.equal(calledPayload.layer_decomposition,true);assert.equal(calledPayload.n,undefined);console.log('PASS reserve 612 and settle two outputs at 72');passed++;
upstream=[{url:'https://provider/ordinary'}];r=await request(body);assert.equal(r.status,502);assert.equal(refunds,1);console.log('PASS ignored layer mode refunds');passed++;
upstream=[base,layer];persistent=false;r=await request(body);assert.equal(r.status,502);assert.equal(refunds,2);console.log('PASS transient storage fallback refunds');passed++;
console.log(`Layer decomposition ${passed} passed, mocked provider and ledger.`);
})().catch(e=>{console.error(e);process.exitCode=1});
// Exercise real reservation settlement with a transactional in-memory ledger.
(async()=>{
 let refundTotal=0;const query=async(q,p)=>{
  if(['BEGIN','COMMIT','ROLLBACK'].includes(q)||q.startsWith('SELECT id FROM users'))return {rows:[]};
  if(q.startsWith('SELECT delta'))return {rows:[{delta:-612}]};
  if(q.startsWith('SELECT COALESCE'))return {rows:[{total:refundTotal}]};
  if(q.startsWith('INSERT INTO credit_ledger')){refundTotal+=p[1];return {rows:[]}};
  throw Error(q);
 };
 const tx=load('lib/creditTransactions.ts',{'./db':{sql:{connect:async()=>({query,release(){}})}},'./creditReplay':{replayCredits:()=>1000},'./siraya':{SirayaApiError:ApiError}});
 assert.equal(await tx.settleCharge(1,'1',72),540);
 assert.equal(await tx.settleCharge(1,'1',72),0);
 assert.equal(refundTotal,540);
 await assert.rejects(tx.settleCharge(1,'1',613));
 console.log('PASS actual settlement helper is idempotent and rejects over-reservation cost');
})().catch(e=>{console.error(e);process.exitCode=1});
