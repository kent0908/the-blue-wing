"use client";
import { useLocale, useTr } from "@/lib/i18n/client";
import { simplifyChinese } from "@/lib/i18n/simplifyChinese";
import { useEffect,useRef,useState,type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Composer from './Composer';
import type { OfficialTemplate } from '@/lib/officialTemplates';
type Reference={id:number;src:string;name:string};
export default function OfficialTemplateComposer({template,composerProps}:{template:OfficialTemplate;composerProps:ComponentProps<typeof Composer>}){
 const tr=useTr();
 const locale=useLocale();
 const router=useRouter();
 const [ref,setRef]=useState<Reference|null>(null);
 const [failed,setFailed]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const request=useRef<Promise<Response>|null>(null);
 useEffect(()=>{
  let alive=true;
  request.current??=fetch('/api/templates/use',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({officialId:template.id})});
  request.current.then(async response=>{
   if(!alive)return;
   if(response.status===401){router.replace('/login?next='+encodeURIComponent('/studio?mode=video&operation=freestyle&official='+template.id));return;}
   const data=await response.clone().json();
   if(!response.ok||!data.ref)throw Error('template_reference_unavailable');
   if(alive)setRef(data.ref);
  }).catch(()=>{if(alive)setFailed(true)});
  return()=>{alive=false};
 },[template.id,router,attempt]);
 if(failed)return <div role="alert" className="rounded-xl border border-[#735849] bg-[#211b16] p-5 text-sm"><p>{tr("角色素材暫時無法載入，請重試。此次沒有生成或扣點。")}</p><button type="button" onClick={()=>{request.current=null;setFailed(false);setAttempt(x=>x+1)}} className="mt-3 mr-4 underline">{tr("重新載入")}</button><Link href="/" className="underline">{tr("返回首頁")}</Link></div>;
 if(!ref)return <div role="status" className="rounded-xl bg-[#161c18] p-6 text-sm text-[#a1b4a8]">{tr("正在載入「{title}」與示範角色…", { title: tr(template.title) })}</div>;
 // This component receives only an exact built-in template, never a user's brief or history.
 const initialPrompt=locale === "zh-Hans" ? simplifyChinese(template.prompt) : template.prompt;
 return <Composer {...composerProps} initialModel={composerProps.initialModel??template.model} initialPrompt={initialPrompt} initialRefs={[ref]} initialSettings={{seconds:template.seconds,resolution:template.resolution,aspectRatio:template.aspectRatio}}/>;
}
