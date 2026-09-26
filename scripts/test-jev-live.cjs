// Uses synthetic data only; never prints credentials or raw provider errors.
// CLI-provided OIDC is read directly for this local smoke test.
delete process.env.VERCEL;
const originalFetch = global.fetch;
global.fetch = async (...args) => {
 const response = await originalFetch(...args);
 if (!response.ok) {
  const body = await response.clone().json().catch(()=>({}));
  let detail=String(body.message ?? body.error?.message ?? body.error_type ?? "");
  for(const secret of [process.env.VERCEL_OIDC_TOKEN,process.env.AI_GATEWAY_API_KEY]) if(secret)detail=detail.split(secret).join('[redacted]');
  console.error('Gateway diagnostic:',response.status,detail.slice(0,500));
 }
 return response;
};
const fs=require('fs'),ts=require('typescript');
function load(file){const m={exports:{}};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(id=>id==='./companionDecision'?load('lib/companionDecision.ts'):require(id),m.exports);return m.exports;}
// Live smoke test: needs a real gateway credential. Without one it is SKIPPED, not failed,
// so the offline suite stays green (run it where AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN is set).
(async()=>{const {jevEvaluator,gatewayCredential}=load('lib/companionDecisionProvider.ts');
 if(!(await gatewayCredential())){console.log('SKIP jev live smoke: no gateway credential configured');return;}
 const samples=[['proposed','我們下週一起去海邊好嗎？','好，下週再約時間。'],['completed','今天一起完成了海邊淨灘，垃圾也分類送走了。','是啊，今天一起清理海岸的活動完成了。']];
 for(const [expected,user,assistant] of samples){const start=Date.now();const r=await jevEvaluator.evaluate({relationship:'朋友',recent:[{role:'user',content:user},{role:'assistant',content:assistant}]});console.log(JSON.stringify({expected,event:r.event,confidence:r.confidence,model:r.model,inputTokens:r.inputTokens,costUsd:r.gatewayCostUsd,durationMs:Date.now()-start}));if(r.event!==expected)process.exitCode=1;}
})().catch(e=>{console.error('Jev smoke failed:',/^http_\d+$|^invalid_response$|^gateway_not_configured$/.test(e.message)?e.message:'connection_or_timeout');process.exitCode=1});
