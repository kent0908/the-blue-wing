const fs=require('fs');
const sharp=require('sharp');
const endpoint=process.argv[2];
const ws=new WebSocket(endpoint);
const pending=new Map();let id=0,session;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
function send(method,params={},root=false){return new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params,...(!root&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const report=[];
function check(name,pass,detail){report.push({name,pass,detail});console.log(JSON.stringify(report.at(-1)));if(!pass)throw Error(name);}
async function ready(){for(let i=0;i<100;i++){if(await evaluate('!!document.querySelector("canvas") && document.body.innerText.includes("36 秒呼吸循環")'))return;await wait(150);}throw Error('not ready');}
async function click(label){const r=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}));if(!b)throw Error('button missing');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});await wait(80);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const b=Buffer.from(r.data,'base64');fs.writeFileSync('wing-'+name+'.png',b);return b;}
async function diff(a,b){const [x,y]=await Promise.all([sharp(a).raw().toBuffer(),sharp(b).raw().toBuffer()]);let sum=0,changed=0;for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);sum+=d;if(d>12)changed++;}return {mean:sum/x.length,changed:changed/x.length};}
async function glowShot(name){const clip=await evaluate('(()=>{const r=[...document.querySelectorAll("canvas")].at(-1).getBoundingClientRect();const y=Math.max(0,r.y);return {x:r.x,y,width:r.width,height:Math.min(r.bottom,innerHeight)-y,scale:1}})()');const r=await send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false});const b=Buffer.from(r.data,'base64');fs.writeFileSync('wing-'+name+'.png',b);return b;}
(async()=>{
 await new Promise(r=>ws.onopen=r);const targets=await send('Target.getTargets',{},true);const url=process.argv[3]||'http://localhost:3111/';const target=targets.targetInfos.find(t=>t.type==='page');
 session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;await send('Page.enable');await send('Runtime.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url});
 for(let i=0;i<100;i++){if(await evaluate('document.querySelectorAll("[data-media-slot]").length===12'))break;await wait(150);}
 check('four galleries with three slots each',await evaluate('document.querySelectorAll("[data-media-slot]").length===12'));
 check('original companion entry retained',await evaluate('[...document.querySelectorAll("#companions a")].some(a=>a.getAttribute("href")==="/companions")'));
 await wait(2000);
 for(const slot of ['video','companions']){
  await evaluate(`document.getElementById('${slot}').scrollIntoView({block:'center',behavior:'instant'})`);
  for(let i=0;i<100;i++){if(await evaluate(`document.querySelector('#${slot} video').readyState>=2`))break;await wait(150);}
  const a=await evaluate(`document.querySelector('#${slot} video').currentTime`);await wait(1200);const b=await evaluate(`document.querySelector('#${slot} video').currentTime`);check(slot+' original video still plays',b!==a);await shot('gallery-'+slot);
 }
 const layout=await evaluate('(()=>{const els=[...document.querySelectorAll("#video [data-media-slot]")];return els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})})()');check('desktop two extra cards to the right',layout[1].x>layout[0].x+layout[0].w-1 && layout[2].x===layout[1].x && layout[2].y>layout[1].y,layout);
 await evaluate('document.querySelector("footer").scrollIntoView({block:"end",behavior:"instant"})');await wait(500);const glowA=await glowShot('closing-a');await wait(2000);const glowB=await glowShot('closing-b');check('closing particles visibly animate',(await diff(glowA,glowB)).changed>.0001,await diff(glowA,glowB));
 check('offscreen videos pause',await evaluate('[...document.querySelectorAll("video")].filter(v=>{const r=v.getBoundingClientRect();return r.bottom < -100 || r.top > innerHeight+100}).every(v=>v.paused)'));
 await click('暫停流光');await wait(300);const pauseA=await glowShot('closing-paused-a');await wait(1200);const pauseB=await glowShot('closing-paused-b');check('closing pause freezes field',(await diff(pauseA,pauseB)).mean===0);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await evaluate('document.getElementById("video").scrollIntoView({block:"start",behavior:"instant"})');await wait(500);check('mobile no horizontal overflow',await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('gallery-mobile');
 const ml=await evaluate('(()=>{return [...document.querySelectorAll("#video [data-media-slot]")].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})})()');check('mobile main above two side cards',ml[1].y>=ml[0].y+ml[0].h-1&&ml[2].y===ml[1].y,ml);
 await evaluate('document.querySelector("footer").scrollIntoView({block:"end",behavior:"instant"})');await shot('closing-mobile');
 await send('Page.navigate',{url:new URL('/admin/landing',url).href});await wait(1500);check('admin requires login',await evaluate('location.pathname==="/login"'));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fs.writeFileSync('gallery-browser-results.json',JSON.stringify(report,null,2));ws.close();});





