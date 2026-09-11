"use client";
import { useRef, useState } from "react";

export default function CanvasVideoPreview({src, poster, title}:{src:string; poster?:string; title:string}) {
  const video=useRef<HTMLVideoElement>(null);
  const [playing,setPlaying]=useState(false);
  const [failed,setFailed]=useState(false);
  async function toggle(){
    const el=video.current;
    if(!el)return;
    if(!el.paused){el.pause();return;}
    setFailed(false);
    try{await el.play();}catch{setFailed(true);}
  }
  return <div className="relative mb-3 aspect-video overflow-hidden rounded-lg bg-black">
    <video ref={video} src={src} poster={poster} aria-label={`${title}影片預覽`} className="h-full w-full object-contain" muted playsInline preload="none" disablePictureInPicture disableRemotePlayback controlsList="nodownload noremoteplayback" onContextMenu={e=>e.preventDefault()} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>{setPlaying(false);setFailed(true);}} />
    <button type="button" aria-label={`${playing?'暫停':'播放'}${title}預覽`} onClick={()=>void toggle()} className={`absolute grid place-items-center rounded-full border border-white/30 bg-black/70 text-white hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-emerald-300 ${playing?'right-2 top-2 h-9 w-9':'left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2'}`}>{playing?'Ⅱ':'▶'}</button>
    {failed&&<p role="alert" className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-center text-xs text-red-200">影片載入失敗，請點播放重試</p>}
  </div>;
}
