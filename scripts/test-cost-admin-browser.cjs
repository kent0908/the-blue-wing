const fs=require('node:fs'), assert=require('node:assert/strict'), {randomBytes}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
const base=process.env.COST_TEST_BASE||'http://localhost:3128';
const ws=new WebSocket(process.argv[2]);let session,seq=0;const pending=new Map();const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
const send=(method,params={},root=false)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(!root&&session?{sessionId:session}:{})}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;}
(async()=>{const token=randomBytes(32).toString('hex');try{
 await new Promise(r=>ws.onopen=r);
 const targets=await send('Target.getTargets',{},true);const t=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(base));assert.ok(t,'open the local page first');
 session=(await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},true)).sessionId;
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
 assert.equal((await fetch(base+'/api/crm/costs')).status,401);
 const users=(await sql`select distinct on(role) id,role from users where email_verified and status='active' order by role,id`).rows;
 const admin=users.find(x=>x.role==='admin');assert.ok(admin);
 await sql`insert into sessions(token,user_id,expires_at) values(${token},${admin.id},now()+interval '10 minutes')`;
 const headers={cookie:'bw_session='+token};
 const res=await fetch(base+'/api/crm/costs',{headers});assert.equal(res.status,200);const data=await res.json();
 assert.ok(data.rows.length>=41);assert.equal(data.rows.find(x=>x.modelId==='gpt-image-2').listPriceUsd,15);console.log('Unpriced models:',data.rows.filter(r=>!r.components.length).map(r=>({id:r.modelId,active:r.active,modality:r.modality})));assert.ok(data.rows.filter(r=>r.active).every(r=>r.components.length));
 for(const discountPct of [-1,101])assert.equal((await fetch(base+'/api/crm/costs',{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({modelId:'gpt-image-2',discountPct})})).status,400);
 const member=users.find(x=>x.role==='user');if(member){const mt=randomBytes(32).toString('hex');try{await sql`insert into sessions(token,user_id,expires_at) values(${mt},${member.id},now()+interval '2 minutes')`;assert.equal((await fetch(base+'/api/crm/costs',{headers:{cookie:'bw_session='+mt}})).status,403);}finally{await sql`delete from sessions where token=${mt}`;}}
 console.log(JSON.stringify({models:data.rows.length,official:data.rows.filter(x=>x.verification==='official').length,pending:data.rows.filter(x=>x.verification!=='official').map(x=>x.modelId),recentEvents:data.receipts.length,receiptCoverage:data.receipts.filter(x=>x.provider_cost_usd!==null).length}));
 await send('Network.setCookie',{name:'bw_session',value:token,url:base,httpOnly:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/crm/costs'});
 for(let i=0;i<40;i++){if(await ev(`document.querySelectorAll('article').length>=41`))break;await sleep(250);}
 assert.ok(await ev(`document.body.innerText.includes('模型成本與活動試算')`));
 assert.equal(await ev(`document.documentElement.scrollWidth>innerWidth`),false);
 fs.writeFileSync('crm-cost-audit-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await ev(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>e.parentElement.textContent.includes('選擇模型'));e.value='veo-3.1-generate-001';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(250);
 await ev(`(()=>{const e=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('720/1080p・含音訊 · 秒')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'8');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(250);
 assert.ok(await ev(`document.body.innerText.includes('$3.200000')`));
 for(const width of [390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);assert.equal(await ev(`document.documentElement.scrollWidth>innerWidth`),false,`overflow ${width}`);fs.writeFileSync(`crm-cost-audit-mobile-${width}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 assert.equal(errors.length,0);console.log('PASS admin/anonymous/member access, invalid discounts, tariff coverage, live DB rendering, calculator, desktop/mobile overflow and JS errors; no generation or discount mutation');
}finally{if(session)await send('Network.deleteCookies',{name:'bw_session',url:base}).catch(()=>{});await sql`delete from sessions where token=${token}`;await sql.end();ws.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;ws.close()});
