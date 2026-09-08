require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
(async()=>{
 const {rows}=await sql.query(`select cl.id,cl.delta,cl.created_at,cl.ref,
 exists(select 1 from credit_ledger r where r.user_id=cl.user_id and r.reason='charge_refund' and r.ref=cl.id::text) as refunded,
 exists(select 1 from credit_ledger r where r.user_id=cl.user_id and r.reason='video_refund' and r.ref=cl.ref) as legacy_refunded,
 exists(select 1 from generations g where g.user_id=cl.user_id and g.ref=cl.ref) as recorded,
 (select v.status from character_idle_videos v where v.user_id=cl.user_id and (v.job_id=cl.ref or v.charge_id=cl.id) limit 1) as idle_status,
 (select v.status from character_scene_requests v where v.user_id=cl.user_id and v.job_id=cl.ref limit 1) as scene_status
 from credit_ledger cl where cl.user_id=1 and cl.reason='video' and cl.delta<0 and cl.ref not like 'pending:%' order by cl.id desc limit 40`);
 console.log(JSON.stringify(rows.map(({ref,...r})=>({...r,refLength:ref.length}))));
 const candidates=rows.filter(r=>!r.refunded&&!r.legacy_refunded&&!r.recorded&&!['completed','failed'].includes(r.idle_status)&&!['completed','failed'].includes(r.scene_status));
 console.log(JSON.stringify({oldCount:rows.filter(r=>!r.legacy_refunded&&!r.recorded).length,newCount:candidates.length}));
 // DB-only: no provider requests and no job references are printed or transmitted.
 process.exit(0);
})().catch(()=>{console.error('Read-only concurrency audit failed; no credentials or refs printed');process.exit(1)});
