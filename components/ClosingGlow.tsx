"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./ClosingGlow.module.css";

/** A small decorative field; animation runs only while the closing section is visible. */
export default function ClosingGlow(){
 const canvas=useRef<HTMLCanvasElement>(null),pausedRef=useRef(false);
 const [paused,setPaused]=useState(false);
 useEffect(()=>{
  const el=canvas.current!,ctx=el.getContext('2d');if(!ctx)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let w=1,h=1,frame=0,t=0,last=0,visible=false;
  const preference=()=>{pausedRef.current=motion.matches;setPaused(motion.matches);};preference();motion.addEventListener('change',preference);
  const resize=()=>{w=el.clientWidth;h=el.clientHeight;const dpr=Math.min(devicePixelRatio||1,1.5);el.width=w*dpr;el.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);};
  const size=new ResizeObserver(resize);size.observe(el);resize();
  const view=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;});view.observe(el);
  const draw=(now:number)=>{
   const dt=Math.min((now-last)/1000||0,.05);last=now;
   if(visible&&!document.hidden){
    if(!pausedRef.current)t+=dt;
    ctx.clearRect(0,0,w,h);
    const count=w<600?140:330;
    for(let i=0;i<count;i++){
     const seed=(i*.61803398875)%1, layer=i%3;
     const x=((seed*(w+180)+t*(13+layer*7))%(w+180))-90;
     const wave=x/w*Math.PI*2;
     const y=h*(.58+.22*Math.sin(wave+t*.13+layer*.75)) + Math.sin(i*12.8)*h*.12;
     const bright=i%23===0, r=bright?2.7: .7+((i*.37)%1)*1.1;
     const central=Math.exp(-Math.pow((x-w/2)/(w*.26),2)-Math.pow((y-h*.42)/(h*.28),2));
     const alpha=(.38+.5*((i*.31)%1))*(1-central*.83);
     const color=layer===0?'39,135,255':layer===1?'42,224,229':'112,211,255';
     if(bright){const glow=ctx.createRadialGradient(x,y,0,x,y,17);glow.addColorStop(0,`rgba(${color},${alpha*.48})`);glow.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=glow;ctx.fillRect(x-17,y-17,34,34);}
     ctx.strokeStyle=`rgba(${color},${alpha*.34})`;ctx.lineWidth=r*.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7-layer*3,y-2);ctx.stroke();
     ctx.fillStyle=`rgba(${color},${alpha})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
   }
   frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);size.disconnect();view.disconnect();motion.removeEventListener('change',preference);};
 },[]);
 return <><canvas ref={canvas} aria-hidden="true" className={styles.canvas}/><button className={styles.toggle} aria-pressed={paused} onClick={()=>{pausedRef.current=!paused;setPaused(!paused);}}>{paused?'▷ 播放流光':'Ⅱ 暫停流光'}</button></>;
}
