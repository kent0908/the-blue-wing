"use client";
import { useRef, useState } from 'react';
export default function TemplatePreview({id,title,revision,active,onToggle}:{id:string;title:string;revision?:number;active:boolean;onToggle:()=>void}) {
 const position=useRef(0);
 const [failed,setFailed]=useState(false);
 return <div className="group relative aspect-video overflow-hidden rounded-xl bg-black" onContextMenu={e=>e.preventDefault()}>
  {active&&!failed ? <video src={'/api/official-templates/'+id+'/preview?v='+(revision||1)} poster={'/official-template-posters/'+id+'.jpg'} autoPlay muted loop playsInline disablePictureInPicture disableRemotePlayback controlsList="nodownload noremoteplayback" className="h-full w-full object-cover" onTimeUpdate={e=>{position.current=e.currentTarget.currentTime}} onLoadedMetadata={e=>{if(position.current<e.currentTarget.duration)e.currentTarget.currentTime=position.current}} onError={()=>setFailed(true)} aria-label={title+'預覽'}/> :
   // eslint-disable-next-line @next/next/no-img-element -- local static video poster
   <img src={'/official-template-posters/'+id+'.jpg'} alt={title} loading="lazy" className="h-full w-full object-cover"/>}
  <button type="button" aria-label={(active&&!failed?'暫停':'播放')+title+'預覽'} onClick={()=>{if(failed)setFailed(false);else onToggle()}} className={"absolute grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#76dfbf] "+(active&&!failed?"right-2 top-2 h-9 w-9":"inset-0")}>
   <span className={'grid place-items-center rounded-full border border-white/25 bg-black/65 text-white '+(active&&!failed?'h-9 w-9 text-sm':'h-11 w-11')}>{active&&!failed?'Ⅱ':'▶'}</span>
  </button>
  {failed&&<span role="status" className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-black/80 p-2 text-center text-xs text-white">預覽載入失敗，點擊重試</span>}
 </div>;
}
