"use client";
import { useEffect, useRef } from "react";
import AccountDetails from "./AccountDetails";
export default function AccountDialog({open,onClose}:{open:boolean;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open&&!ref.current?.open)ref.current?.showModal();if(!open&&ref.current?.open)ref.current?.close();},[open]);
 return <dialog ref={ref} aria-label="個人資訊" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget||(e.target as HTMLElement).closest("a"))ref.current?.close();}} className="fixed inset-0 m-auto h-[min(90dvh,900px)] max-h-[90dvh] w-[calc(100%_-_24px)] sm:w-[min(1040px,calc(100%_-_48px))] max-w-none rounded-3xl border border-neutral-700 bg-[#0d0d0d] p-0 text-white shadow-2xl backdrop:bg-black/75">
 <div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 justify-end border-b border-neutral-800 p-3"><button autoFocus aria-label="關閉個人資訊" onClick={()=>ref.current?.close()} className="rounded-full bg-neutral-800 px-4 py-2 text-sm">關閉 ×</button></div><div className="min-h-0 flex-1">{open&&<AccountDetails/>}</div></div>
 </dialog>;
}
