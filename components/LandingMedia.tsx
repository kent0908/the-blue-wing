"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PublicLandingMedia } from "@/lib/landingMedia";
import styles from "./LandingMedia.module.css";

export default function LandingMedia({media,label}:{media:PublicLandingMedia;label:string}){
 const video=useRef<HTMLVideoElement>(null);
 const [playing,setPlaying]=useState(false),[failed,setFailed]=useState(false);
 const manualPause=useRef(false);
 useEffect(()=>{
  const el=video.current;if(!el)return;
  el.removeAttribute("src");el.load();
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");let visible=false;
  const update=()=>{if(visible&&!document.hidden&&!reduced.matches&&!manualPause.current)void el.play().catch(()=>{});else el.pause();};
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible&&!el.getAttribute('src')){el.src=media.url;el.load();}update();},{rootMargin:"100px"});observer.observe(el);
  reduced.addEventListener('change',update);document.addEventListener('visibilitychange',update);el.addEventListener('loadeddata',update);
  return()=>{observer.disconnect();reduced.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);el.removeEventListener('loadeddata',update);el.pause();};
 },[media.url]);
 if(media.kind==="image")return <Image src={media.url} alt={label} fill unoptimized sizes="(max-width:760px) 90vw, 40vw" className={styles.media}/>;
 return <><video ref={video} className={styles.media} aria-label={label} muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setFailed(true)}/>{failed?<p className={styles.error}>影片暫時無法載入</p>:<button className={styles.play} aria-label={`${playing?'暫停':'播放'}${label}`} onClick={()=>{const el=video.current;if(!el)return;if(playing){manualPause.current=true;el.pause();}else{manualPause.current=false;void el.play().catch(()=>setFailed(true));}}}>{playing?'Ⅱ':'▷'}</button>}</>;
}

