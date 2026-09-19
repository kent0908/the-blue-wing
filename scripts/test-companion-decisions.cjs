const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const m={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/companionDecision.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports);
const {parseDecision,reviewDecision}=m.exports;
const fixture={model:'jev-1.13.0',answers:{event:{type:'choice',choice:'proposed',confidence:0.95,probabilities:{none:0.01,proposed:0.96,in_progress:0.01,completed:0.01,uncertain:0.01}},memory:{type:'noul',noul:0.1}},usage:{input_tokens:123}};
const parsed=parseDecision(fixture);
assert.equal(parsed.event,'proposed');
assert.equal(reviewDecision(parsed).applyAutomatically,false);
assert.equal(reviewDecision({...parsed,confidence:0.4}).eventCandidate,'uncertain');
assert.equal(reviewDecision({...parsed,memoryProbability:1}).applyAutomatically,false);
for(const mutate of [x=>x.answers.event.choice='married',x=>x.answers.event.confidence=NaN,x=>x.answers.memory.noul=2,x=>x.usage.input_tokens=-1,x=>delete x.answers.event.probabilities.none,x=>x.answers.event.probabilities.none=0.8]){
 const bad=structuredClone(fixture);mutate(bad);assert.throws(()=>parseDecision(bad));
}
console.log('PASS: typed response, probabilities, malformed output, low confidence, review-only contract');

const providerModule={exports:{}};
new Function('require','exports',ts.transpileModule(fs.readFileSync('lib/companionDecisionProvider.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>m.exports,providerModule.exports);
const {decisionEnabled,jevEvaluator}=providerModule.exports;
(async()=>{
 delete process.env.JEV_MODE;delete process.env.TYPESAFE_API_KEY;
 assert.equal(decisionEnabled(1),false);
 process.env.JEV_MODE='shadow';process.env.TYPESAFE_API_KEY='mock-only';process.env.JEV_SAMPLE_PERCENT='100';
 assert.equal(decisionEnabled(1),true);
 process.env.JEV_SAMPLE_PERCENT='bad';assert.equal(decisionEnabled(1),false);
 process.env.JEV_SAMPLE_PERCENT='100';
 let count=0;global.fetch=async(url,options)=>{count++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.ok(options.signal);const body=JSON.parse(options.body);assert.equal(body.model,'jev-1.13.0');return {ok:true,json:async()=>fixture}};
 await jevEvaluator.evaluate({relationship:'夫妻',recent:[]});assert.equal(count,1);
 global.fetch=async()=>({ok:false,status:429});await assert.rejects(()=>jevEvaluator.evaluate({relationship:'',recent:[]}),/http_429/);
 global.fetch=async()=>{throw Error('timeout')};await assert.rejects(()=>jevEvaluator.evaluate({relationship:'',recent:[]}),/timeout/);
 let statements=[],duplicate=false;
 const sql=async(strings,...values)=>{const q=strings.join('?');statements.push(q);if(q.startsWith('insert')) return {rows:duplicate?[]:[{}]};if(q.includes('select profile'))return {rows:[{profile:{relationship:'夫妻'}}]};if(q.includes('select role'))return {rows:[{role:'assistant',content:'完成了'},{role:'user',content:'x'.repeat(3000)}]};return {rows:[]}};
 let calls=0;
 const worker={exports:{}};
 new Function('require','exports',ts.transpileModule(fs.readFileSync('lib/companionDecisionShadow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(id=>id==='./db'?{sql}:id==='./officialCompanionStory'?{decodeStoryMessage:()=>null}:id==='./companionDecision'?m.exports:{decisionEnabled:()=>true,jevEvaluator:{evaluate:async(state)=>{calls++;assert.ok(state.recent.every(x=>x.content.length<=1800));return parsed}}},worker.exports);
 await worker.exports.recordDecisionShadow(1,2);assert.equal(calls,1);assert.ok(statements.some(q=>q.includes("status = 'completed'")));
 assert.ok(statements.every(q=>!q.includes('update characters')&&!q.includes('credit_ledger')));
 duplicate=true;await worker.exports.recordDecisionShadow(1,2);assert.equal(calls,1);
 console.log('PASS: disabled mode, sampling, provider errors, bounded context, duplicate claim, no live calls or state mutation');
})().catch(e=>{console.error(e);process.exit(1)});
