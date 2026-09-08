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
(async()=>{
 await new Promise(r=>ws.onopen=r);
 const targets=await send('Target.getTargets',{},true);const target=targets.targetInfos.find(t=>t.type==='page'&&t.url.includes('the-blue-wing.vercel.app'));if(!target)throw Error('test target missing');
 session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'https://the-blue-wing.vercel.app/'});await ready();
 check('public page without login',await evaluate('location.pathname==="/" && !!document.querySelector("canvas")'));
 const a=await shot('cycle-start');await wait(4000);const b=await shot('cycle-4s');check('visible movement within 4 seconds',(await diff(a,b)).changed>.002,await diff(a,b));
 await click('切換星雲');await wait(4500);check('nebula control',await evaluate('document.body.innerText.includes("流動 · 星雲形態")'));const nebula=await shot('nebula-verified');
 await click('凝聚標誌');await wait(6000);const logo=await shot('logo-verified');check('distinct logo and nebula',(await diff(nebula,logo)).changed>.03,await diff(nebula,logo));
 await click('暫停');await wait(500);await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:30,y:30});await wait(1500);const pausedA=await shot('paused-a');await wait(1500);const pausedB=await shot('paused-b');check('pause freezes animation',(await diff(pausedA,pausedB)).mean<.02,await diff(pausedA,pausedB));
 const rect=await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+rect.w*.6,y:rect.y+rect.h*.5});await wait(180);const pushed=await shot('pointer-repulsion');check('pointer responds within 180 ms',(await diff(pausedB,pushed)).changed>.0005,await diff(pausedB,pushed));
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:30,y:30});await wait(1500);const returned=await shot('pointer-return');check('pointer returns smoothly',(await diff(pausedB,returned)).mean<.025,await diff(pausedB,returned));
 await click('激起共振');await wait(300);const shock=await shot('resonance');check('resonance displaces particles',(await diff(returned,shock)).changed>.001,await diff(returned,shock));
 await click('播放');await wait(500);await click('自動循環');await send('Page.reload',{ignoreCache:true});await ready();await shot('cycle-0');await wait(18000);const mid=await shot('cycle-18');await wait(18000);const end=await shot('cycle-36');check('full 36 second cycle changes shape',(await diff(mid,end)).changed>.02,await diff(mid,end));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await send('Page.reload',{ignoreCache:true});await ready();
 check('mobile has no horizontal overflow',await evaluate('document.documentElement.scrollWidth<=innerWidth'));
 await shot('mobile-verified');
 await evaluate('scrollTo(0,220)');await wait(100);const touchRect=await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5}})()');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchRect,radiusX:5,radiusY:5,force:1}]});await wait(120);await shot('touch-resonance');await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});check('emulated mobile touch event delivered',true);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Page.reload',{ignoreCache:true});await wait(1800);check('reduced motion starts paused',await evaluate('document.body.innerText.includes("已暫停") && document.body.innerText.includes("減少動態效果")'));
 await shot('reduced-motion');
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*brand-particle-source.png*']});await send('Page.reload',{ignoreCache:true});await wait(2000);check('asset failure displays recovery action',await evaluate('document.body.innerText.includes("羽翼暫時無法展開") && document.body.innerText.includes("重新載入粒子")'));await shot('failure');
 await send('Network.setBlockedURLs',{urls:[]});await send('Emulation.setEmulatedMedia',{features:[]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.reload',{ignoreCache:true});await ready();await shot('public-final');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fs.writeFileSync('wing-browser-results.json',JSON.stringify(report,null,2));ws.close();});
