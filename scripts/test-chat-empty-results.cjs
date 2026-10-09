const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
const {observeBillingStream}=load('lib/providerReceipt.ts');
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
let refunds=0,charged=0,reply,upstream,history=[];
const route=load('app/api/chat/route.ts',{
 'next/server':{NextRequest,NextResponse},'@/lib/providerReceipt':{observeBillingStream},'@/lib/crm':{recordProviderReceipt:async()=>{}},'@/lib/generationValidation':{validateGeneration(){}},
 '@/lib/siraya':{SirayaApiError:ApiError,createChatCompletion:async()=>({choices:[{message:{content:reply}}]}),createChatCompletionStream:async()=>upstream},
 '@/lib/apiauth':{requireUser:async()=>({user:{id:1}})},'@/lib/credits':{creditCost:async()=>8,getBalance:async()=>charged&&!refunds?742:750},
 '@/lib/creditTransactions':{paidCall:async(u,c,k,m,fn)=>{charged++;return {result:await fn(),chargeId:'fixture'};},refundCharge:async()=>{refunds++;}},
 '@/lib/generations':{recordGeneration:async(u,g)=>history.push(g)},'@/lib/errors':{errorResponse:e=>NextResponse.json({error:{message:e.message}},{status:e.status??500})}
});
const request=stream=>route.POST(new NextRequest('https://fixture.test/api/chat',{method:'POST',body:JSON.stringify({model:'fixture',messages:[{role:'user',content:'fixture'}],stream})}));
const bytes=text=>new TextEncoder().encode(text);
function source(text){let offset=0;const b=bytes(text);return new ReadableStream({pull(c){if(offset===b.length)c.close();else{c.enqueue(b.slice(offset,offset+3));offset=Math.min(b.length,offset+3);}}});}
function reset(){refunds=0;charged=0;history=[];}
let checks=0;async function test(name,fn){reset();await fn();checks++;console.log('PASS '+name);}
(async()=>{
 for(const invalid of [undefined,'','   ',42,{text:'invalid shape'}])await test('empty/invalid completion refunds and cannot report success',async()=>{reply=invalid;const r=await request(false),j=await r.json();assert.equal(r.status,502);assert.equal(j.creditsSpent,0);assert.equal(j.creditsBalance,750);assert.equal(refunds,1);assert.equal(history.length,0);});
 await test('nonempty completion returns fresh ledger balance',async()=>{reply='real reply';const r=await request(false),j=await r.json();assert.equal(r.status,200);assert.equal(j.creditsBalance,742);assert.equal(refunds,0);assert.equal(history.length,1);});
 await test('missing SSE body refunds before response',async()=>{upstream=new Response(null,{status:204});assert.equal((await request(true)).status,502);assert.equal(refunds,1);});
 await test('empty completed SSE refunds exactly once',async()=>{const raw='data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"cost":0.25,"usage":{"completion_tokens":0}}\n\ndata: [DONE]\n';upstream=new Response(source(raw));assert.equal(await (await request(true)).text(),raw);assert.equal(refunds,1);});
 await test('fragmented Unicode SSE preserves output without refund',async()=>{const raw='data: {"choices":[{"delta":{"content":"こんにちは，你好"}}]}\n\ndata: [DONE]\n';upstream=new Response(source(raw));assert.equal(await (await request(true)).text(),raw);assert.equal(refunds,0);});
 await test('stream transport error before text refunds',async()=>{const error=Error('transport fixture');const broken=new ReadableStream({pull(){throw error;}});await assert.rejects(new Response(observeBillingStream(broken,async()=>{},async()=>{refunds++;})).text(),e=>e===error);assert.equal(refunds,1);});
 await test('partial delivered text followed by transport error is not refunded as empty',async()=>{let pulls=0;const error=Error('partial fixture');const broken=new ReadableStream({pull(c){if(pulls++===0)c.enqueue(bytes('data: {"choices":[{"delta":{"content":"delivered"}}]}\n'));else c.error(error);}});await assert.rejects(new Response(observeBillingStream(broken,async()=>{},async()=>{refunds++;})).text(),e=>e===error);assert.equal(refunds,0);});
 await test('cancelling a stream with no text releases source and refunds',async()=>{let cancelled=false;const pending=new ReadableStream({cancel(){cancelled=true;}});const reader=observeBillingStream(pending,async()=>{},async()=>{refunds++;}).getReader();await reader.cancel();assert.equal(refunds,1);assert.equal(cancelled,true);});
 console.log(`Chat empty results: ${checks} cases passed; no network, provider charges or production data.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
