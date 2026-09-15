"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import { useTr } from "@/lib/i18n/client";
export default function Page(){
 const tr = useTr();
 const [sets,setSets]=useState<{id:string;prompt?:string;createdAt?:string}[]>([]);const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/layer-sets").then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error?.message||tr("載入失敗"));setSets(j.layerSets??j.sets??[]);}).catch(e=>setError(e.message));},[]);
 return <main className="mx-auto max-w-3xl p-6"><h1 className="mb-5 text-xl">{tr("圖層分離紀錄")}</h1>{error&&<p role="alert">{tr(error)}</p>}{!error&&!sets.length&&<p>{tr("尚無圖層分離紀錄。")}</p>}<div className="space-y-3">{sets.map(s=><Link className="block rounded-xl border border-white/15 p-4" key={s.id} href={`/layers/${s.id}`}>{s.prompt||tr("自動圖層分離")}</Link>)}</div></main>;
}
