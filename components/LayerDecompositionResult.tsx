"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { downloadResult } from "@/lib/download";
interface Layer { url:string; z_index:number; size?:string; name?:string; description?:string; bounding_box?:{normalized:number[];absolute:number[]} }
export default function LayerDecompositionResult({id}:{id:string}) {
  const [layers,setLayers]=useState<Layer[]>([]);
  const [hidden,setHidden]=useState<number[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();fetch(`/api/layer-sets/${encodeURIComponent(id)}`,{signal:controller.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error?.message||"圖層載入失敗");setLayers(j.layers??j.layerSet?.layers??[]);}).catch(e=>{if(e.name!=="AbortError")setError(e.message);});return()=>controller.abort();},[id]);
  const base=layers.find(l=>l.z_index===0);
  const dimensions=base?.size?.split("x").map(Number);
  const ratio=dimensions?.length===2&&dimensions.every(n=>n>0)?`${dimensions[0]} / ${dimensions[1]}`:"1 / 1";
  function manifest(){const u=URL.createObjectURL(new Blob([JSON.stringify({id,layers},null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download=`blue-wing-layers-${id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  return <section className="mx-auto w-full max-w-4xl p-4" aria-label="圖層分離結果">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2>圖層分離 · {Math.max(0,layers.length-1)} 個圖層</h2><Link href={`/layers/${id}`} className="text-xs text-[#9ae9d4]">開啟獨立頁面</Link></div>
    {error?<p role="alert" className="text-red-300">{error}</p>:!base?<p>載入圖層中…</p>:<>
      <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-xl" style={{aspectRatio:ratio,background:"repeating-conic-gradient(#262626 0% 25%,#363636 0% 50%) 50% / 20px 20px"}}>
        {[...layers].sort((a,b)=>a.z_index-b.z_index).filter(l=>!hidden.includes(l.z_index)).map(l=>{const b=l.bounding_box?.normalized;return <img key={l.z_index} alt={l.name|| (l.z_index===0?"底圖":`圖層 ${l.z_index}`)} src={l.url} className="absolute" style={l.z_index===0?{inset:0,width:"100%",height:"100%"}:b?{left:`${b[0]/10}%`,top:`${b[1]/10}%`,width:`${(b[2]-b[0])/10}%`,height:`${(b[3]-b[1])/10}%`}:{inset:0,width:"100%",height:"100%"}}/>;})}
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={manifest} className="rounded-lg border border-white/20 px-3 py-2 text-xs">下載圖層位置 JSON</button><Link className="p-2 text-xs text-[#9ae9d4]" href="/layers">圖層紀錄</Link></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{layers.map(l=><div key={l.z_index} className="flex items-center gap-3 rounded-lg border border-white/10 p-3"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={!hidden.includes(l.z_index)} onChange={e=>setHidden(e.target.checked?hidden.filter(z=>z!==l.z_index):[...hidden,l.z_index])}/><span className="truncate" title={l.description}>{l.z_index===0?"底圖":`${l.z_index} · ${l.name||"圖層"}`}</span></label><button type="button" className="text-xs text-[#9ae9d4]" onClick={()=>downloadResult({id:`${id}-${l.z_index}`,kind:"image",url:l.url})}>下載</button></div>)}</div>
    </>}
  </section>;
}
