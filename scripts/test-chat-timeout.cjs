/**
 * A slow provider must abort inside paidCall's try, so the reserved charge
 * is refunded. Before the timeout existed, the platform killed the function
 * mid-await instead and the charge stayed on the ledger.
 */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in mocks)return mocks[id];if(String(id).startsWith('node:'))return require(id);return require(id)},m,m.exports);return m.exports;}

const client=load('lib/siraya.ts',{'./modelMonitoring':{monitoredModelFetch:(u,i)=>fetch(u,i),requestOutcome:()=>'network_error'},'./watermark':{applyWatermarkDefaults:b=>b}});
let checks=0; const check=f=>{f();checks++;};

// the chat helpers must always carry an abort signal
const original=global.fetch; const seen=[];
global.fetch=async(url,init)=>{seen.push(init);return {ok:true,status:200,json:async()=>({}),headers:new Headers()};};
process.env.SIRAYA_API_KEY='test-key';
(async()=>{
  await client.createChatCompletion({model:'m',messages:[]});
  await client.createChatCompletionStream({model:'m',messages:[]});
  global.fetch=original;
  check(()=>assert.equal(seen.length,2));
  for(const init of seen){
    check(()=>assert.ok(init.signal,'chat requests must carry an abort signal'));
    check(()=>assert.equal(typeof init.signal.aborted,'boolean'));
    const body=JSON.parse(init.body);
    // reasoning stays off unless the caller overrides it
    check(()=>assert.equal(body.reasoning_effort,'none'));
  }
  // an explicit caller value wins over the default
  global.fetch=async(url,init)=>{seen.push(init);return {ok:true,status:200,json:async()=>({}),headers:new Headers()};};
  await client.createChatCompletion({model:'m',messages:[],reasoning_effort:'high'});
  global.fetch=original;
  check(()=>assert.equal(JSON.parse(seen[2].body).reasoning_effort,'high'));

  // the route's function budget must outlast the provider timeout, or the
  // abort (and its refund) never gets a chance to run
  const routeSrc=fs.readFileSync('app/api/chat/route.ts','utf8');
  const companionSrc=fs.readFileSync('app/api/characters/[id]/messages/route.ts','utf8');
  const timeout=Number(/CHAT_TIMEOUT_MS = ([\d_]+)/.exec(fs.readFileSync('lib/siraya.ts','utf8'))[1].replace(/_/g,''));
  for(const [name,src] of [['/api/chat',routeSrc],['companion messages',companionSrc]]){
    const m=/maxDuration = (\d+)/.exec(src);
    check(()=>assert.ok(m,`${name} must declare maxDuration`));
    check(()=>assert.ok(Number(m[1])*1000 > timeout,`${name} maxDuration must exceed the ${timeout}ms provider timeout`));
  }
  console.log(`PASS ${checks} chat timeout/reasoning checks; no provider or database calls`);
})().catch(e=>{console.error(e);process.exitCode=1});
