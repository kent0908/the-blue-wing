const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm'),assert=require('node:assert/strict');
const events=[];let response,dbFails=false;const sql=async(strings,...values)=>{if(dbFails)throw Error('db unavailable');events.push(values)};
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/modelMonitoring.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,require:id=>id==='./db'?{sql}:require(id),Date,console:{error(){}},fetch:async()=>{if(response instanceof Error)throw response;return response;}});
const {monitoredModelFetch,requestOutcome}=exportsObject;
(async()=>{
 for(const status of [200,202,400,401,429,502]){response=new Response('unchanged',{status});const result=await monitoredModelFetch('https://example.test',{body:'private',headers:{Authorization:'secret'}},{model:'test',provider:'siraya',requestId:'00000000-0000-0000-0000-000000000001',attempt:1});assert.equal(result,response);assert.equal(events.at(-1)[4],status);assert.equal(events.at(-1)[5],'http');}
 for(const [name,outcome] of [['TimeoutError','timeout'],['AbortError','cancelled'],['TypeError','network_error']]){response=Object.assign(new Error('private upstream body'),{name});await assert.rejects(()=>monitoredModelFetch('https://example.test',{}, {model:'test',provider:'siraya'}),e=>e===response);assert.equal(events.at(-1)[4],null);assert.equal(events.at(-1)[5],outcome);}
 assert.ok(!JSON.stringify(events).includes('private'));assert.ok(!JSON.stringify(events).includes('secret'));
 dbFails=true;response=new Response('ok');assert.equal(await monitoredModelFetch('https://example.test',{}, {model:'test',provider:'siraya'}),response);
 assert.equal(requestOutcome(null),'network_error');console.log('PASS HTTP statuses, timeout/network/cancellation, metadata-only storage, original responses/errors, fail-open logging');
})().catch(e=>{console.error(e);process.exitCode=1});
