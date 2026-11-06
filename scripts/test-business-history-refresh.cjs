// Execute the real history loader to verify concurrent submission/poll behavior.
const fs = require('node:fs'), assert = require('node:assert/strict'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync('components/business/BusinessWorkspace.tsx', 'utf8');
const ast = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadHistory') handler = node.initializer.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast); assert.ok(handler);
const compile = ts.transpileModule(`globalThis.run = ${handler}`, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
(async () => {
  let release, requests = 0, jobs = [{id:'new',status:'processing'}], error = '', loading = false;
  const context = { AbortSignal, Promise, Map, historyLock:{current:false}, historyVersion:{current:0}, unresolvedRequest:{current:null}, t:{unavailable:'unavailable'}, businessError:()=> 'error', isPending:job=>job.status==='processing', setError:value=>{error=value}, setHistoryLoading:value=>{loading=value}, setUncertain:()=>{}, setJobs:value=>{jobs=value}, fetch:()=>{requests++;return new Promise(resolve=>{release=resolve})} };
  vm.runInNewContext(compile,context);
  const oldRequest=context.run(false);
  await context.run(false); assert.equal(requests,1,'Concurrent refreshes share the in-flight lock');
  context.historyVersion.current++; // A generation has arrived since the request began.
  release({ok:true,json:async()=>({generations:[]})}); await oldRequest;
  assert.equal(jobs[0].id,'new','A stale history response must not erase a newly submitted generation');
  assert.equal(loading,false); assert.equal(context.historyLock.current,false);
  context.fetch=async()=>({ok:true,json:async()=>({generations:[{id:'new',status:'completed'}]})});
  await context.run(false); assert.equal(jobs[0].status,'completed','The next refresh updates the result normally');
  context.fetch=async()=>{throw Error('timeout')}; await context.run();
  assert.equal(error,'unavailable'); assert.equal(context.historyLock.current,false,'Failure releases the lock for retry');
  assert.equal(jobs[0].status,'completed','Refresh failure preserves the existing output');
  console.log('PASS history refresh: deduplication, stale-response protection, subsequent completion, error recovery, no paid requests');
})().catch(error=>{console.error(error);process.exitCode=1});
