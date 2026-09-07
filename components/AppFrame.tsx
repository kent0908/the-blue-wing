"use client";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import SupportChat from "./SupportChat";
export default function AppFrame({children}:{children:React.ReactNode}) {
  const path=usePathname();
  const drawer=useRef<HTMLDialogElement>(null);
  if(path==="/landing") return <main className="h-full overflow-y-auto scroll-smooth motion-reduce:scroll-auto">{children}</main>;
  return <><div className="flex h-full">
    <div className="hidden md:block"><Sidebar/></div>
    <dialog ref={drawer} aria-label="主要導覽" className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none border-0 bg-black p-0 text-white backdrop:bg-black/70" onClick={e=>{if((e.target as HTMLElement).closest("a"))drawer.current?.close();}}>
      <button type="button" autoFocus onClick={()=>drawer.current?.close()} className="w-full p-3 text-right" aria-label="關閉導覽">關閉 ×</button>
      <div className="h-[calc(100%_-_48px)]"><Sidebar/></div>
    </dialog>
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center bg-black"><button type="button" aria-label="開啟導覽" onClick={()=>drawer.current?.showModal()} className="shrink-0 p-3 text-xl md:hidden">☰</button><div className="min-w-0 flex-1"><TopBar/></div></div>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  </div><SupportChat/></>;
}
