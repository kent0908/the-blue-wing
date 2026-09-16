"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PublicLandingMedia } from "@/lib/landingMedia";
import styles from "./LandingMedia.module.css";
import { useTr } from "@/lib/i18n/client";

export default function LandingMedia({media,label}:{media:PublicLandingMedia;label:string}){
 const tr = useTr();
 const video=useRef<HTMLVideoElement>(null);
 const [playing,setPlaying]=useState(false),[failed,setFailed]=useState(false);
 const manualPause=useRef(false);
 useEffect(()=>{
  const el=video.current;if(!el)return;
  el.removeAttribute("src");el.load();
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");let visible=false,dead=false;
  const update=()=>{if(dead)return;if(visible&&!document.hidden&&!reduced.matches&&!manualPause.current)void el.play().catch(()=>{});else el.pause();};
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible&&!el.getAttribute('src')){el.src=media.url;el.load();}update();},{rootMargin:"100px"});observer.observe(el);
  // A container the browser opens but whose video track it can't decode
  // (HEVC .mp4 on most Windows/Firefox builds) still fires play/pause — it
  // "plays" the muted audio over a black box. Treat width 0 as a failure so
  // the card shows a message instead of a working pause button over nothing.
  const onLoaded=()=>{if(el.videoWidth===0){dead=true;el.pause();setFailed(true);return;}update();};
  reduced.addEventListener('change',update);document.addEventListener('visibilitychange',update);el.addEventListener('loadeddata',onLoaded);
  return()=>{observer.disconnect();reduced.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);el.removeEventListener('loadeddata',onLoaded);el.pause();};
 },[media.url]);
 if(media.kind==="image")return <Image src={media.url} alt={label} fill unoptimized sizes="(max-width:760px) 90vw, 40vw" className={styles.media}/>;
 return <><video ref={video} className={styles.media} aria-label={label} muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setFailed(true)}/>{failed?<p className={styles.error}>{tr("影片暫時無法載入")}</p>:<button className={styles.play} aria-label={`${playing?tr("暫停"):tr("播放")}${label}`} onClick={()=>{const el=video.current;if(!el)return;if(playing){manualPause.current=true;el.pause();}else{manualPause.current=false;void el.play().catch(()=>setFailed(true));}}}>{playing?'Ⅱ':'▷'}</button>}</>;
}

