"use client";
import { useEffect,useRef,useState,type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Composer from './Composer';
import type { OfficialTemplate } from '@/lib/officialTemplates';
type Reference={id:number;src:string;name:string};
export default function OfficialTemplateComposer({template,composerProps}:{template:OfficialTemplate;composerProps:ComponentProps<typeof Composer>}){
 const router=useRouter();
 const [ref,setRef]=useState<Reference|null>(null);
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 const request=useRef<Promise<Response>|null>(null);
 useEffect(()=>{
  let alive=true;
  request.current??=fetch('/api/templates/use',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({officialId:template.id})});
  request.current.then(async response=>{
   if(!alive)return;
   if(response.status===401){router.replace('/login?next='+encodeURIComponent('/studio?mode=video&operation=freestyle&official='+template.id));return;}
   const data=await response.clone().json();
   if(!response.ok||!data.ref)throw Error('角色素材暫時無法載入，請重試。');
   if(alive)setRef(data.ref);
  }).catch(()=>{if(alive)setError('角色素材暫時無法載入，請重試。此次沒有生成或扣點。')});
  return()=>{alive=false};
 },[template.id,router,attempt]);
 if(error)return <div role="alert" className="rounded-xl border border-[#735849] bg-[#211b16] p-5 text-sm"><p>{error}</p><button type="button" onClick={()=>{request.current=null;setError('');setAttempt(x=>x+1)}} className="mt-3 mr-4 underline">重新載入</button><Link href="/" className="underline">返回首頁</Link></div>;
 if(!ref)return <div role="status" className="rounded-xl bg-[#161c18] p-6 text-sm text-[#a1b4a8]">正在載入「{template.title}」與示範角色…</div>;
 return <Composer {...composerProps} initialModel={composerProps.initialModel??template.model} initialPrompt={template.prompt} initialRefs={[ref]} initialSettings={{seconds:template.seconds,resolution:template.resolution,aspectRatio:template.aspectRatio}}/>;
}
