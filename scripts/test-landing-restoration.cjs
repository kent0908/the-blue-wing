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
 await new Promise(r=>ws.onopen=r);const targets=await send('Target.getTargets',{},true);const target=targets.targetInfos.find(t=>t.type==='page'&&t.url.includes('the-blue-wing.vercel.app'));
 session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'https://the-blue-wing.vercel.app/'});
 for(let i=0;i<100;i++){if(await evaluate('!!document.querySelector("#companions")'))break;await wait(200);}
 check('cycle caption removed',await evaluate('!document.body.innerText.includes("36 秒呼吸循環")'));
 check('particle experience retained',await evaluate('!!document.querySelector("canvas")'));
 check('AI companion section and link restored',await evaluate('[...document.querySelectorAll("#companions a")].some(a=>a.getAttribute("href")==="/companions")'));
 check('original two video slots restored',await evaluate('document.querySelectorAll("video").length===2'));
 for(const slot of ['video','companions']){
  await evaluate(`document.getElementById('${slot}').scrollIntoView({block:'center',behavior:'instant'})`);
  for(let i=0;i<100;i++){if(await evaluate(`document.querySelector('#${slot} video').readyState>=2`))break;await wait(200);}
  const a=await evaluate(`(()=>{const v=document.querySelector('#${slot} video');return {time:v.currentTime,width:v.videoWidth,ready:v.readyState,error:v.error?.code}})()`);await wait(1800);
  const b=await evaluate(`document.querySelector('#${slot} video').currentTime`);check(slot+' original video plays',a.width>0&&a.ready>=2&&!a.error&&b!==a.time,{...a,after:b});await shot('restored-'+slot);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await evaluate('document.getElementById("companions").scrollIntoView({block:"center",behavior:"instant"})');check('mobile section fits',await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('restored-mobile');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fs.writeFileSync('landing-restoration-results.json',JSON.stringify(report,null,2));ws.close();});

