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
async function click(label){const r=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}));if(!b)throw Error('button missing');b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});await wait(80);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const b=Buffer.from(r.data,'base64');fs.writeFileSync('wing-'+name+'.png',b);return b;}
async function diff(a,b){const [x,y]=await Promise.all([sharp(a).raw().toBuffer(),sharp(b).raw().toBuffer()]);let sum=0,changed=0;for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);sum+=d;if(d>12)changed++;}return {mean:sum/x.length,changed:changed/x.length};}
(async()=>{
 await new Promise(r=>ws.onopen=r);
 const targets=await send('Target.getTargets',{},true);const target=targets.targetInfos.find(t=>t.type==='page'&&t.url.includes('the-blue-wing.vercel.app'));
 session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.reload',{ignoreCache:true});await ready();
 const supported=await evaluate('(()=>{const e=document.querySelector("canvas").getContext("webgl").getExtension("WEBGL_lose_context");if(!e)return false;e.loseContext();return true})()');
 check('WebGL context loss simulation available',supported);await wait(300);
 check('context loss has recovery UI',await evaluate('document.body.innerText.includes("圖形連線中斷")'));
 await click('重新載入粒子');await ready();check('retry creates working WebGL context',await evaluate('!document.querySelector("canvas").getContext("webgl").isContextLost() && !document.body.innerText.includes("羽翼暫時無法展開")'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await send('Page.reload',{ignoreCache:true});await ready();await click('暫停');check('mobile pause button',await evaluate('document.body.innerText.includes("已暫停")'));
 await evaluate('scrollTo(0,220)');await wait(1600);const before=await shot('touch-before');
 const p=await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x+r.width*.55,y:r.y+r.height*.55}})()');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:6,radiusY:6,force:1}]});await wait(180);const after=await shot('touch-after');check('touch visibly displaces paused particles',(await diff(before,after)).changed>.001,await diff(before,after));await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.reload',{ignoreCache:true});await ready();await evaluate('scrollTo(0,0)');await shot('public-final');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fs.writeFileSync('wing-recovery-results.json',JSON.stringify(report,null,2));ws.close();});

