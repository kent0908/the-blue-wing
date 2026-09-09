"use client";
import Link from 'next/link';
import { useState } from 'react';
import { OFFICIAL_TEMPLATES, TEMPLATE_CATEGORIES } from '@/lib/officialTemplates';
export default function OfficialTemplates(){
 const [category,setCategory]=useState('全部');
 const [playing,setPlaying]=useState<string|null>(null);
 const items=OFFICIAL_TEMPLATES.filter(item=>category==='全部'||item.category===category);
 return <section id="official-templates" aria-label="官方電影模板" className="mt-10">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs tracking-[.2em] text-[#6edabb]">THE BLUE WING · TEMPLATES</p><h2 className="text-2xl font-semibold">官方電影模板</h2><p className="mt-2 text-sm text-[#899b92]">從一個鏡頭開始，找到你的故事風格。</p></div><span className="text-xs text-[#84958d]">{OFFICIAL_TEMPLATES.length} 個模板 · Seedance 2.0 mini</span></div>
  <div className="my-5 flex flex-wrap gap-2" role="group" aria-label="模板分類">{['全部',...TEMPLATE_CATEGORIES].map(c=><button key={c} type="button" aria-pressed={category===c} onClick={()=>{setCategory(c);setPlaying(null)}} className={'rounded-full border px-4 py-2 text-xs transition-colors '+(category===c?'border-[#76dfbf] bg-[#76dfbf] text-black':'border-[#303934] bg-[#121714] text-[#b1bdb6] hover:border-[#708a7b]')}>{c} <span className="opacity-60">{OFFICIAL_TEMPLATES.filter(t=>c==='全部'||t.category===c).length}</span></button>)}</div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item=><article key={item.id} className="overflow-hidden rounded-2xl border border-[#29342d] bg-[#101713]">
   <div className="relative aspect-video bg-black">{playing===item.id?<video className="h-full w-full object-cover" src={'/api/official-templates/'+item.id+'/preview'} poster={'/official-template-posters/'+item.id+'.jpg'} autoPlay muted loop playsInline controls preload="none" onError={()=>setPlaying(null)} aria-label={item.title+'預覽'}/>:<button type="button" className="group relative h-full w-full" aria-label={'播放'+item.title+'預覽'} onClick={()=>setPlaying(item.id)}>
    {/* eslint-disable-next-line @next/next/no-img-element -- small locally generated preview poster */}
    <img src={'/official-template-posters/'+item.id+'.jpg'} alt={item.character+'・'+item.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.025]"/><span className="absolute inset-0 grid place-items-center"><span className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/50 text-white">▶</span></span></button>}
    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white">{item.category}</span></div>
   <div className="p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{item.title}</h3><span className="text-xs text-[#88998f]">{item.seconds}s · 720p</span></div><p className="mt-1 text-xs text-[#82948a]">{item.technique} · {item.character}</p><details className="mt-3 text-xs text-[#b4c4ba]"><summary className="cursor-pointer">查看提示詞</summary><p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap leading-6">{item.prompt}</p></details><Link href={'/studio?mode=video&operation=freestyle&official='+item.id} className="mt-4 block rounded-lg bg-[#1f3e30] px-3 py-2 text-center text-sm text-[#9de8c5] hover:bg-[#2b513e]">套用模板 ↗</Link></div>
  </article>)}</div><p className="mt-4 text-xs text-[#798c81]">套用後可替換角色素材與提示詞；生成前會顯示所需點數。</p>
 </section>;
}
