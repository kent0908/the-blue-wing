/**
 * A slow provider must abort inside paidCall's try, so the reserved charge
 * is refunded. Before the timeout existed, the platform killed the function
 * mid-await instead and the charge stayed on the ledger.
 */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id in mocks)return mocks[id];if(String(id).startsWith('node:'))return require(id);return require(id)},m,m.exports);return m.exports;}

const client=load('lib/siraya.ts',{'./wanVideo':load('lib/wanVideo.ts',{}),'./modelMonitoring':{monitoredModelFetch:(u,i)=>fetch(u,i),requestOutcome:()=>'network_error'},'./watermark':{applyWatermarkDefaults:b=>b}});
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
  // 7 of the catalogue's 80 text models reject reasoning_effort:"none" with a
  // 400 and answer fine without it (swept 2026-09-27). The default must not be
  // able to break a model outright.
  const reject=(message,status=400)=>{const e=new client.SirayaApiError(status,message);return e;};
  check(()=>assert.ok(client.rejectsReasoningDefault(reject("Unsupported value: 'none' is not supported with the 'gpt-5.4-pro' model"),{model:'m',messages:[]})));
  check(()=>assert.ok(client.rejectsReasoningDefault(reject('The model does not support setting thinking_budget to 0.'),{model:'m',messages:[]})));
  check(()=>assert.ok(client.rejectsReasoningDefault(reject('This model does not support `reasoning_effort` value `none`.'),{model:'m',messages:[]})));
  // an unrelated 400, another status, or a caller-chosen effort must never retry
  check(()=>assert.ok(!client.rejectsReasoningDefault(reject('messages: field required'),{model:'m',messages:[]})));
  check(()=>assert.ok(!client.rejectsReasoningDefault(reject('reasoning_effort',402),{model:'m',messages:[]})));
  check(()=>assert.ok(!client.rejectsReasoningDefault(reject('reasoning_effort'),{model:'m',messages:[],reasoning_effort:'high'})));
  check(()=>assert.ok(!client.rejectsReasoningDefault(new Error('reasoning_effort'),{model:'m',messages:[]})));
  // end to end: the retry drops the flag and keeps everything else
  const sent=[];
  global.fetch=async(url,init)=>{sent.push(JSON.parse(init.body));
    return sent.length===1
      ? {ok:false,status:400,json:async()=>({error:{message:"Unsupported value: 'none' is not supported with the 'x' model"}}),headers:new Headers()}
      : {ok:true,status:200,json:async()=>({ok:true}),headers:new Headers()};};
  const out=await client.createChatCompletion({model:'grok-4.5',messages:[{role:'user',content:'hi'}],max_tokens:700});
  global.fetch=original;
  check(()=>assert.equal(sent.length,2,'a rejected default must be retried exactly once'));
  check(()=>assert.equal(sent[0].reasoning_effort,'none'));
  check(()=>assert.equal(sent[1].reasoning_effort,undefined,'the retry must drop the flag'));
  check(()=>assert.equal(sent[1].max_tokens,700,'the retry must keep the original body'));
  check(()=>assert.equal(sent[1].model,'grok-4.5'));
  check(()=>assert.deepEqual(out,{ok:true}));
  // an unrelated 400 still throws, and only one request is made
  const once=[];
  global.fetch=async(url,init)=>{once.push(init);return {ok:false,status:400,json:async()=>({error:{message:'messages: field required'}}),headers:new Headers()};};
  await assert.rejects(client.createChatCompletion({model:'m',messages:[]}));
  global.fetch=original;
  check(()=>assert.equal(once.length,1,'an unrelated 400 must not be retried'));

  // the retry must share the one deadline, not start a fresh 45s: two full
  // budgets outlast the 60s maxDuration, which is the stranded-charge failure
  // CHAT_TIMEOUT_MS exists to prevent
  const signals=[];
  global.fetch=async(url,init)=>{signals.push(init.signal);
    return signals.length===1
      ? {ok:false,status:400,json:async()=>({error:{message:"Unsupported value: 'none' is not supported"}}),headers:new Headers()}
      : {ok:true,status:200,json:async()=>({}),headers:new Headers()};};
  const before=Date.now();
  await client.createChatCompletion({model:'m',messages:[]});
  global.fetch=original;
  check(()=>assert.equal(signals.length,2));
  for(const s of signals) check(()=>assert.ok(s && typeof s.aborted==='boolean'));
  // AbortSignal.timeout exposes no deadline, so assert the shape that enforces
  // it: the source must derive each attempt's signal from one shared instant.
  const src=fs.readFileSync('lib/siraya.ts','utf8');
  check(()=>assert.ok(/function chatDeadline/.test(src),'a shared deadline helper must exist'));
  check(()=>assert.equal((src.match(/signal: AbortSignal\.timeout\(CHAT_TIMEOUT_MS\)/g)||[]).length,0,
    'no chat attempt may start its own full-length timeout'));
  for(const fn of ['createChatCompletion','createChatCompletionStream']){
    const body=src.slice(src.indexOf('export async function '+fn));
    check(()=>assert.ok(/const remaining = chatDeadline\(\);/.test(body.slice(0,400)),fn+' must take one deadline for the whole call'));
  }
  void before;

  console.log(`PASS ${checks} chat timeout/reasoning checks; no provider or database calls`);
})().catch(e=>{console.error(e);process.exitCode=1});
