/**
 * The 18+ gate against a running build: SSR output, the API guard, and every
 * rejection path. SKIPS when no server is listening — same convention as
 * test-jev-live.cjs, so the offline suite stays green.
 *
 *   npx next build && npx next start -p 3127 &
 *   node scripts/test-adult-gate-live.cjs [baseUrl]
 */
/* eslint-disable @typescript-eslint/no-require-imports -- .cjs script, require() is the point */
const {randomBytes}=require('node:crypto'),fs=require('node:fs');
for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=/^([A-Z0-9_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^"|"$/g,'');}
process.env.POSTGRES_URL||=process.env.DATABASE_URL;
const {sql}=require('@vercel/postgres');
const BASE=process.argv[2]||process.env.BW_BASE_URL||'http://127.0.0.1:3127';
let pass=0,fail=0;
const ok=(cond,label,extra='')=>{if(cond){pass++;console.log('  ✓ '+label);}else{fail++;console.log('  ✗ '+label+(extra?'  → '+extra:''));}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let up=false;
 for(let i=0;i<3;i++){try{const r=await fetch(BASE+'/api/models',{signal:AbortSignal.timeout(4000)});if(r.status<500){up=true;break;}}catch{}await wait(1000);}
 if(!up){console.log('SKIP adult gate live checks: no server at '+BASE);process.exit(0);}
 // 1. signed-out /companions must still render the shelf (SSR, crawlers)
 const anon=await fetch(BASE+'/companions');const anonHtml=await anon.text();
 console.log('未登入 /companions');
 ok(anon.status===200,'HTTP 200','got '+anon.status);
 ok(anonHtml.length>5000,'HTML 有內容（不是空白）','length='+anonHtml.length);
 ok(!anonHtml.includes('陪聊區限 18 歲以上'),'未登入不顯示年齡插頁');
 ok(/官方角色|Official/.test(anonHtml),'官方角色櫃有被伺服器渲染出來');

 const email='gate-e2e-'+randomBytes(5).toString('hex')+'@example.invalid';
 const u=(await sql`insert into users(email,password_hash,email_verified) values(${email},'x',true) returning id`).rows[0];
 const token=randomBytes(32).toString('hex');
 await sql`insert into sessions(token,user_id,expires_at) values(${token},${u.id},now()+interval '20 minutes')`;
 const cookie='bw_session='+token;
 try{
  console.log('\n已登入但未確認年齡');
  const page=await fetch(BASE+'/companions',{headers:{cookie}});const html=await page.text();
  ok(html.includes('陪聊區限 18 歲以上'),'伺服器直接渲染出年齡插頁（不是空白再閃）');
  ok(!/官方角色櫃|OfficialCharacterGrid/.test(html)||html.indexOf('陪聊區限')<html.length,'插頁取代了內容');
  const blocked=await fetch(BASE+'/api/characters',{headers:{cookie}});const bj=await blocked.json().catch(()=>({}));
  ok(blocked.status===403,'GET /api/characters 被擋','status='+blocked.status);
  ok(bj?.error?.code==='age_unverified','錯誤碼是 age_unverified','got '+JSON.stringify(bj?.error?.code));
  const msg=await fetch(BASE+'/api/characters/1/messages',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({content:'hi'})});
  ok(msg.status===403,'POST messages 也被擋','status='+msg.status);
  const age0=await fetch(BASE+'/api/account/age',{headers:{cookie}});const a0=await age0.json();
  ok(a0?.verified===false,'GET /api/account/age 回報未驗證');

  console.log('\n出生日期驗證');
  const post=async(birthDate)=>{const r=await fetch(BASE+'/api/account/age',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({birthDate})});return {status:r.status,json:await r.json().catch(()=>({}))};};
  const bad=await post('not-a-date');
  ok(bad.status===400&&bad.json?.error?.code==='invalid_date','亂填 → 400 invalid_date',bad.status+' '+bad.json?.error?.code);
  const roll=await post('2007-02-30');
  ok(roll.status===400,'2007-02-30 被拒（不會滾成 3/2）','status='+roll.status);
  const future=await post('2030-01-01');
  ok(future.status===400,'未來日期 → 400（不是 under_age）','status='+future.status);
  const minor=await post('2015-06-01');
  ok(minor.status===403&&minor.json?.error?.code==='under_age','未滿 18 → 403 under_age',minor.status+' '+minor.json?.error?.code);
  const stillBlocked=await fetch(BASE+'/api/characters',{headers:{cookie}});
  ok(stillBlocked.status===403,'被拒的日期沒有放行');
  const notStored=(await sql`select birth_date, adult_confirmed_at from users where id=${u.id}`).rows[0];
  ok(!notStored.birth_date&&!notStored.adult_confirmed_at,'被拒的日期沒有寫進資料庫',JSON.stringify(notStored));

  console.log('\n通過之後');
  const good=await post('1995-03-14');
  ok(good.status===200&&good.json?.verified===true,'成年日期 → 200 verified',good.status+' '+JSON.stringify(good.json));
  const row=(await sql`select birth_date, adult_confirmed_at from users where id=${u.id}`).rows[0];
  ok(!!row.birth_date&&!!row.adult_confirmed_at,'birth_date 與 adult_confirmed_at 都寫入了',JSON.stringify(row));
  const allowed=await fetch(BASE+'/api/characters',{headers:{cookie}});
  ok(allowed.status===200,'GET /api/characters 放行','status='+allowed.status);
  const page2=await fetch(BASE+'/companions',{headers:{cookie}});const html2=await page2.text();
  ok(!html2.includes('陪聊區限 18 歲以上'),'插頁不再出現');
  ok(html2.length>5000,'內容正常渲染','length='+html2.length);
  // the 18th-birthday edge, through the real endpoint
  const today=new Date();
  const exactly18=new Date(Date.UTC(today.getUTCFullYear()-18,today.getUTCMonth(),today.getUTCDate())).toISOString().slice(0,10);
  const oneDayShort=new Date(Date.UTC(today.getUTCFullYear()-18,today.getUTCMonth(),today.getUTCDate()+1)).toISOString().slice(0,10);
  console.log('\n生日邊界（透過真實 API）');
  await sql`update users set birth_date=null, adult_confirmed_at=null where id=${u.id}`;
  const e18=await post(exactly18); ok(e18.status===200,'今天剛滿 18 → 放行 ('+exactly18+')','status='+e18.status);
  await sql`update users set birth_date=null, adult_confirmed_at=null where id=${u.id}`;
  const d1=await post(oneDayShort); ok(d1.status===403,'明天才滿 18 → 擋住 ('+oneDayShort+')','status='+d1.status);
 } finally { await sql`delete from users where id=${u.id}`; }
 console.log((fail ? 'FAIL ' : 'PASS ') + pass + ' adult gate live checks, ' + fail + ' failed');
 process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
