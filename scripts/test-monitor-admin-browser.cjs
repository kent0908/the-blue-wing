const fs=require('node:fs'), assert=require('node:assert/strict'), {randomBytes}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
const base=process.env.MONITOR_TEST_BASE||'http://localhost:3128';
const watchdog=setTimeout(()=>{console.error('Browser verification timed out');process.exit(1)},60000);
const ws=new WebSocket(process.argv[2]);let session,seq=0;const pending=new Map();const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
const send=(method,params={},root=false)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(!root&&session?{sessionId:session}:{})}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;}
(async()=>{const token=randomBytes(32).toString('hex');try{
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error("Browser connection failed"));});
 const targets=await send('Target.getTargets',{},true);const t=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(base));assert.ok(t,'open the local page first');
 session=(await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},true)).sessionId;
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
 assert.equal((await fetch(base+'/api/crm/monitoring')).status,401);
 const users=(await sql`select distinct on(role) id,role from users where email_verified and status='active' order by role,id`).rows;
 const admin=users.find(x=>x.role==='admin');assert.ok(admin);
 await sql`insert into sessions(token,user_id,expires_at) values(${token},${admin.id},now()+interval '10 minutes')`;
 const headers={cookie:'bw_session='+token};
 const res=await fetch(base+'/api/crm/monitoring',{headers});assert.equal(res.status,200);const data=await res.json();
 assert.ok(Number.isInteger(data.totals.attempts));assert.ok(data.options.includes('gpt-image-2'));
 for(const query of ['?from=2026-02-30&to=2026-03-01','?days=0','?days=367'])assert.equal((await fetch(base+'/api/crm/monitoring'+query,{headers})).status,400);
 const filtered=await(await fetch(base+'/api/crm/monitoring?from=2026-09-26&to=2026-09-26&model=gpt-image-2',{headers})).json();assert.equal(filtered.period.from,'2026-09-26');assert.ok(filtered.models.every(r=>r.model==='gpt-image-2'));
 const member=users.find(x=>x.role==='user');if(member){const mt=randomBytes(32).toString('hex');try{await sql`insert into sessions(token,user_id,expires_at) values(${mt},${member.id},now()+interval '2 minutes')`;assert.equal((await fetch(base+'/api/crm/monitoring',{headers:{cookie:'bw_session='+mt}})).status,403);}finally{await sql`delete from sessions where token=${mt}`;}}
 await send('Network.setCookie',{name:'bw_session',value:token,url:base,httpOnly:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/crm/monitoring'});
 for(let i=0;i<40;i++){if(await ev(`!!document.querySelector('option[value="gpt-image-2"]')`))break;await sleep(250);}
 assert.ok(await ev(`document.body.innerText.includes('模型使用量監控')`));
 assert.equal(await ev(`document.documentElement.scrollWidth>innerWidth`),false);
 assert.ok(await ev(`document.body.innerText.includes('每日用量趨勢') && document.body.innerText.includes('模型用量排行') && document.body.innerText.includes('狀態碼分布圖')`));
 if(data.series.length){
  assert.ok(await ev(`!!document.querySelector('svg[aria-label*="每日 HTTP"]')`));
  await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='長條圖').click()`);
  await sleep(100);
  assert.ok(await ev(`!!document.querySelector('svg[aria-label*="長條"] rect')`));
  await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='折線圖').click()`);
  await sleep(100);
  assert.ok(await ev(`!!document.querySelector('svg[aria-label*="折線"] circle')`));
 }
 await ev(`document.querySelector('svg[aria-label*="每日 HTTP"]')?.scrollIntoView({block:'center'})`);
 fs.writeFileSync('crm-monitoring-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 for(const width of [390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);assert.equal(await ev(`document.documentElement.scrollWidth>innerWidth`),false,`overflow ${width}`);fs.writeFileSync(`crm-monitoring-mobile-${width}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await ev(`(()=>{const e=document.querySelector('[aria-label="篩選模型"]');e.value='gpt-image-2';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(350);
 assert.equal(await ev(`document.querySelector('[aria-label="篩選模型"]').value`),'gpt-image-2');
 assert.equal(errors.length,0);console.log('PASS monitoring admin/anonymous/member access, date validation, model filtering, live rendering, desktop/mobile overflow, no JS errors; no paid calls');
}finally{if(session)await send('Network.deleteCookies',{name:'bw_session',url:base}).catch(()=>{});await sql`delete from sessions where token=${token}`;await sql.end();clearTimeout(watchdog);ws.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;ws.close()});
