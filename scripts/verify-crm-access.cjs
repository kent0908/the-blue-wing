const assert=require('node:assert/strict');const{randomBytes}=require('node:crypto');const{loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd(),false,{info(){},error(){}});process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;const{sql}=require('@vercel/postgres');
const base=process.argv[2]||'http://127.0.0.1:3114';
(async()=>{
 const paths=['/api/crm/costs','/api/crm/overview?days=30','/api/crm/models?days=30','/api/crm/settings','/api/crm/audit'];
 for(const path of paths)assert.equal((await fetch(base+path)).status,401,path);
 assert.equal((await fetch(base+'/crm/finance',{redirect:'manual'})).status,307);
 const users=(await sql`select distinct on (role) id,role from users where email_verified and status <> 'banned' order by role,id`).rows;
 for(const user of users){const token=randomBytes(32).toString('hex');try{
 await sql`insert into sessions(token,user_id,expires_at) values(${token},${user.id},now()+interval '5 minutes')`;
 const headers={cookie:'bw_session='+token};
 for(const path of paths){const r=await fetch(base+path,{headers});assert.equal(r.status,user.role==='admin'?200:403,path+' '+user.role);if(user.role==='admin'&&path.includes('costs')){const j=await r.json();console.log('Public tariffs:',j.rows.filter(x=>x.source).length,'Pending:',j.rows.filter(x=>!x.source).length);assert.equal(j.rows.find(x=>x.modelId==='gpt-image-2').listPriceUsd,30);}if(user.role==='admin'&&path.includes('overview')){const j=await r.json();assert.equal(j.totals.costUsd,null);assert.equal(j.totals.marginPct,null);}}
 if(user.role==='admin'){
 for(const query of ['from=2026-02-30&to=2026-03-01','from=2026-09-07&to=2026-09-06','from=2024-01-01&to=2026-09-12'])assert.equal((await fetch(base+'/api/crm/overview?'+query,{headers})).status,400);
 const r=await fetch(base+'/api/crm/overview?from=2026-08-01&to=2026-09-12',{headers});assert.equal(r.status,200);const j=await r.json();assert.equal(j.period.from,'2026-08-01');assert.equal(j.period.to,'2026-09-12');assert.equal(j.series.length,43);assert.equal(j.totals.creditsSpent,j.totals.adminCreditsSpent+j.totals.customerCreditsSpent);
 const single=await(await fetch(base+'/api/crm/overview?from=2026-09-06&to=2026-09-06',{headers})).json();assert.equal(single.series.length,1);assert.equal(single.totals.revenueEstUsd,0);assert.equal(single.totals.revenueCashUsd,0);assert.ok(single.totals.adminCreditsSpent>0);
 console.log('PASS custom intervals and historical admin-only consumption; member face value:',j.totals.revenueEstUsd,'admin net credits:',j.totals.adminCreditsSpent);
 }
 const r=await fetch(base+'/crm/finance',{headers,redirect:'manual'});assert.equal(r.status,user.role==='admin'?200:307);console.log('PASS',user.role,'CRM pages and APIs');
 }finally{await sql`delete from sessions where token=${token}`;}}
 console.log('PASS anonymous CRM denial');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>sql.end());
