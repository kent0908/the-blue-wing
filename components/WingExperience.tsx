"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./WingExperience.module.css";

// No logo texture is drawn. Its blue pixels become independent GPU point vertices.
const vertex = `
precision highp float;
attribute vec3 aHome;
attribute vec4 aSeed;
uniform float uTime, uMorph, uDpr, uScale, uActive, uShock;
uniform vec2 uAspect, uPointer, uOrigin;
varying vec3 vColor;
varying float vAlpha;
void main(){
 float s=aSeed.x, phase=s*6.2831853, outer=aHome.z;
 float t=uTime;
 float m=smoothstep(aSeed.y*.12,.84+aSeed.y*.12,uMorph);
 float angle=phase+t*(.065+.065*aSeed.y)*(aSeed.z>.5?1.:-1.);
 float radius=.30+pow(aSeed.y,.65)*1.12;
 vec2 cloud=vec2(cos(angle)*radius,sin(angle)*radius*.72);
 cloud+=vec2(sin(t*.22+phase*3.),cos(t*.19+phase*2.))*(.06+.09*aSeed.z);
 vec2 home=aHome.xy*(1.+sin(t*.65)*.012);
 home+=vec2(sin(t*.8+home.y*8.+phase),cos(t*.65+home.x*9.+phase))*.009;
 vec2 p=mix(home,cloud,m);
 p+=vec2(-sin(phase+m*3.),cos(phase+m*3.))*sin(m*3.14159)*(.13+.2*aSeed.z);
 if(outer>.5){
   float a=phase+t*(.045+.09*aSeed.z)*(s>.45?1.:-1.);
   float r=1.02+.43*aSeed.y+.10*sin(phase*5.+t*.31);
   p=vec2(cos(a)*r,sin(a)*r*.66);
   p+=vec2(sin(a*3.+t*.21),cos(a*4.-t*.17))*(.08+.1*aSeed.z);
 }
 vec2 delta=p-uPointer; float d=length(delta);
 float force=exp(-d*d/ .065)*uActive;
 vec2 dir=delta/max(d,.015);
 p+=(dir*.24+vec2(-dir.y,dir.x)*.10)*force;
 float dist=length(p-uOrigin);
 float wave=exp(-pow((dist-uShock*.78)/.17,2.))*exp(-uShock*.75)*step(0.,uShock);
 p+=(p-uOrigin)/max(dist,.01)*wave*.40;
 gl_Position=vec4(p*uScale/uAspect,0.,1.);
 float bright=step(.965,aSeed.w);
 gl_PointSize=(3.3+2.7*aSeed.w+bright*5.0)*uDpr*(outer>.5?.85:1.);
 vec3 blue=vec3(.09,.44,1.0), cyan=vec3(.12,.91,1.0);
 vColor=mix(blue,cyan,clamp(aHome.x*.45+aHome.y*.3+.5,0.,1.));
 vColor=mix(vColor,vec3(.76,.96,1.),bright*.65);
 vAlpha=(.68+.30*aSeed.z)*(.83+.17*sin(t*1.2+phase*4.));
 if(outer>.5) vAlpha*=.78+.20*sin(phase*3.+t*.4);
}
`;
const fragment = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main(){
 float r=length(gl_PointCoord-.5)*2.;
 if(r>1.) discard;
 float halo=exp(-r*r*4.)*.32;
 float core=1.-smoothstep(.08,.43,r);
 gl_FragColor=vec4(mix(vColor,vec3(.78,.97,1.),core*.5),(halo+core*.78)*vAlpha);
}
`;

type Controls = { paused: boolean; mode: "auto" | "logo" | "nebula"; shock: number };
export default function WingExperience() {
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const control=useRef<Controls>({paused:false,mode:"auto",shock:0});
 const [paused,setPaused]=useState(false);
 const [mode,setMode]=useState<Controls["mode"]>("auto");
 const [status,setStatus]=useState("正在喚醒粒子…");
 const [failed,setFailed]=useState(false);
 const [reduced,setReduced]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  const canvas=canvasRef.current!;
  let disposed=false, frame=0, gl:WebGLRenderingContext|null=null, program:WebGLProgram|null=null;
  const buffers:WebGLBuffer[]=[], shaders:WebGLShader[]=[];
  let observer:ResizeObserver|undefined;
  const motion=matchMedia("(prefers-reduced-motion: reduce)");
  const motionChanged=()=>{control.current.paused=motion.matches;setPaused(motion.matches);setReduced(motion.matches);};
  motion.addEventListener("change",motionChanged);
  let pointer=[99,99], active=0, targetActive=0, origin=[0,0], shockAt=-100;
  const scale=.66;
  let width=1,height=1,dpr=1,time=0,last=0,morph=0,realTime=0,visible=true;
  let shockSeen=control.current.shock;
  const point=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();const min=Math.min(r.width,r.height);return [(e.clientX-r.left-r.width/2)*2/min/scale,(r.height/2-e.clientY+r.top)*2/min/scale];};
  const move=(e:PointerEvent)=>{pointer=point(e);targetActive=1;};
  const leave=()=>{targetActive=0;};
  const down=(e:PointerEvent)=>{move(e);origin=point(e);shockAt=realTime;};
  const up=(e:PointerEvent)=>{if(e.pointerType!=="mouse")leave();};
  const lost=(e:Event)=>{e.preventDefault();cancelAnimationFrame(frame);setFailed(true);setStatus("圖形連線中斷，請重新載入粒子。");};
  canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerleave",leave);canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",leave);canvas.addEventListener("webglcontextlost",lost);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});intersection.observe(canvas);
  const init=async()=>{
   try{
    motionChanged();setFailed(false);setStatus("正在喚醒粒子…");
    const img=new Image();img.src="/brand-particle-source.png";await img.decode();if(disposed)return;
    const sample=document.createElement("canvas");sample.width=286;sample.height=274;
    const ctx=sample.getContext("2d");if(!ctx)throw Error("無法讀取品牌素材");
    ctx.drawImage(img,397,55,286,274,0,0,286,274);
    const pixels=ctx.getImageData(0,0,286,274).data, homes:number[]=[];
    for(let y=0;y<274;y++)for(let x=0;x<286;x++){const i=(y*286+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(b>55&&b>r*1.28&&g>r*1.12)homes.push((x/286-.5)*2,(.5-y/274)*1.92);}
    if(homes.length<500)throw Error("品牌粒子素材無法辨識");
    gl=canvas.getContext("webgl",{alpha:true,antialias:false,powerPreference:"high-performance"});if(!gl)throw Error("此裝置未能啟用 WebGL");
    const compile=(type:number,source:string)=>{const shader=gl!.createShader(type)!;shaders.push(shader);gl!.shaderSource(shader,source);gl!.compileShader(shader);if(!gl!.getShaderParameter(shader,gl!.COMPILE_STATUS))throw Error("粒子著色器載入失敗");return shader;};
    program=gl.createProgram()!;gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error("粒子引擎初始化失敗");gl.useProgram(program);
    const compact=matchMedia("(max-width: 760px)").matches||navigator.hardwareConcurrency<=4;
    const count=compact?6500:15000;
    const home=new Float32Array(count*3),seed=new Float32Array(count*4);
    let randomSeed=71427;const random=()=>{randomSeed=(randomSeed*1664525+1013904223)>>>0;return randomSeed/4294967296;};
    for(let i=0;i<count;i++){const k=Math.floor(random()*homes.length/2)*2;home.set([homes[k]+(random()-.5)*.004,homes[k+1]+(random()-.5)*.004,i%5===0?1:0],i*3);seed.set([random(),random(),random(),random()],i*4);}
    const attr=(name:string,data:Float32Array,size:number)=>{const b=gl!.createBuffer()!;buffers.push(b);gl!.bindBuffer(gl!.ARRAY_BUFFER,b);gl!.bufferData(gl!.ARRAY_BUFFER,data,gl!.STATIC_DRAW);const loc=gl!.getAttribLocation(program!,name);gl!.enableVertexAttribArray(loc);gl!.vertexAttribPointer(loc,size,gl!.FLOAT,false,0,0);};attr("aHome",home,3);attr("aSeed",seed,4);
    const u=Object.fromEntries(["uTime","uMorph","uDpr","uScale","uActive","uShock","uAspect","uPointer","uOrigin"].map(n=>[n,gl!.getUniformLocation(program!,n)]));
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(0,0,0,0);
    let quality=compact?1.5:2,drawCount=count,slowFrames=0,measured=0;
    const resize=()=>{width=canvas.clientWidth;height=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,quality);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);gl!.viewport(0,0,canvas.width,canvas.height);};
    observer=new ResizeObserver(resize);observer.observe(canvas);resize();setStatus("");
    const render=(now:number)=>{
     if(disposed)return;const elapsed=last?(now-last)/1000:0;last=now;const dt=Math.min(elapsed,.05);realTime+=dt;
     if(visible&&!document.hidden){
      if(!control.current.paused)time+=dt;
      if(control.current.shock!==shockSeen){shockSeen=control.current.shock;origin=[0,0];shockAt=realTime;}
      const phase=time%36;const smooth=(a:number,b:number,v:number)=>{const x=Math.max(0,Math.min(1,(v-a)/(b-a)));return x*x*(3-2*x);};
      const target=control.current.mode==="logo"?0:control.current.mode==="nebula"?1:smooth(9,17,phase)*(1-smooth(24,34,phase));
      if(!control.current.paused)morph+=(target-morph)*(1-Math.exp(-dt*1.7));active+=(targetActive-active)*(1-Math.exp(-dt*14));
      gl!.uniform1f(u.uTime,time);gl!.uniform1f(u.uMorph,morph);gl!.uniform1f(u.uDpr,dpr);gl!.uniform1f(u.uScale,scale);gl!.uniform1f(u.uActive,active);gl!.uniform1f(u.uShock,realTime-shockAt);
      const min=Math.min(width,height);gl!.uniform2f(u.uAspect,width/min,height/min);gl!.uniform2f(u.uPointer,pointer[0],pointer[1]);gl!.uniform2f(u.uOrigin,origin[0],origin[1]);
      gl!.clear(gl!.COLOR_BUFFER_BIT);gl!.drawArrays(gl!.POINTS,0,drawCount);
      if(measured<150&&elapsed>0){measured++;if(elapsed>.03)slowFrames++;if(measured===150&&slowFrames>55){quality=1;drawCount=Math.floor(count*.7);resize();}}
     }
     frame=requestAnimationFrame(render);
    };frame=requestAnimationFrame(render);
   }catch(error){if(!disposed){setFailed(true);setStatus(error instanceof Error?error.message:"粒子載入失敗");}}
  };void init();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();intersection.disconnect();motion.removeEventListener("change",motionChanged);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerleave",leave);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",leave);canvas.removeEventListener("webglcontextlost",lost);buffers.forEach(b=>gl?.deleteBuffer(b));shaders.forEach(s=>gl?.deleteShader(s));if(program)gl?.deleteProgram(program);};
 },[retry]);
 const select=(next:Controls["mode"])=>{control.current.mode=next;control.current.paused=false;setPaused(false);setMode(next);};
 return <section className={styles.experience} aria-label="啟程 — 互動粒子羽翼">
  <div className={styles.copy}><p className={styles.eyebrow}><span/> THE BLUE WING / 啟程</p><h1>每個靈感，<br/>都有<span>翅膀。</span></h1><p className={styles.description}>讓想像，在此甦醒。<br/>從一點微光，飛向無限可能。</p><Link href="/studio?mode=video" className={styles.cta}>展開創作 <span>↗</span></Link><div className={styles.signature}>青い翼 <span>雲とAIで未来へ</span></div></div>
  <div className={styles.visual}><div className={styles.visualLabel}><span>01 — LIVING EMBLEM</span><span>BLUE / CYAN / LIGHT</span></div><canvas key={retry} ref={canvasRef} className={styles.canvas} aria-label="由藍色與青綠粒子組成的品牌羽翼；移動或觸碰可推開粒子，點擊激起波紋。" role="img"/>
   {failed&&<div className={styles.failure} role="alert"><strong>羽翼暫時無法展開</strong><p>{status}</p><button onClick={()=>setRetry(v=>v+1)}>重新載入粒子</button></div>}
   <div className={styles.caption}><span className={styles.liveDot}/>{failed?"載入中斷":paused?"已暫停 · 仍可互動":mode==="auto"?status:mode==="logo"?"凝聚 · 羽翼形態":"流動 · 星雲形態"}<span className={styles.hint}>移動探索 · 點擊共振</span></div>
  </div>
  <div className={styles.bottom}><p>讓微光，回應你的每一次靠近。<span>{reduced?"已依系統偏好減少動態效果":"拖曳或觸碰粒子，感受它的呼吸。"}</span></p><div className={styles.controls} aria-label="粒子控制"><button disabled={failed} onClick={()=>select(mode==="nebula"?"logo":"nebula")}>{mode==="nebula"?"↗ 凝聚標誌":"✧ 切換星雲"}</button><button disabled={failed} onClick={()=>{control.current.shock++;}}>◎ 激起共振</button><button disabled={failed} aria-pressed={paused} onClick={()=>{control.current.paused=!paused;setPaused(!paused);}}>{paused?"▶ 播放":"Ⅱ 暫停"}</button><button disabled={failed} aria-pressed={mode==="auto"} className={styles.auto} onClick={()=>select("auto")}>自動循環</button></div></div>
 </section>;
}





