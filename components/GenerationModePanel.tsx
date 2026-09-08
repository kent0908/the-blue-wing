"use client";
import { useState } from "react";
import Link from "next/link";
import { getGenerationModes } from "@/lib/generationModes";

export default function GenerationModePanel({ model, kind, operation, onOperation, selected, onSelected }: {
  model: string; kind: "image" | "video"; operation: string; onOperation: (value:string)=>void;
  selected: number[]; onSelected: (ids:number[])=>void;
}) {
  const [assets,setAssets] = useState<{id:number;name:string;status:string;assetType:string}[]>([]);
  const [error,setError] = useState("");
  const [open,setOpen] = useState(false);
  const [page,setPage] = useState(1);
  const [pages,setPages] = useState(1);
  const [loading,setLoading] = useState(false);
  const modes=getGenerationModes(model,kind);
  async function load(next=1) {
    setOpen(true); setLoading(true);setError("");
    try {
      const response=await fetch(`/api/provider-assets?page=${next}&pageSize=20`);
      const json=await response.json();
      if(!response.ok) throw new Error(json?.error?.message || "素材載入失敗");
      setAssets(json.assets ?? []);setPage(next);setPages(json.pagination?.totalPages ?? 1);
    } catch(e) {setError(e instanceof Error?e.message:"素材載入失敗");}
    finally {setLoading(false);}
  }
  return <div className="border-b border-white/10 px-4 py-3 text-xs">
    <div className="flex flex-wrap items-center gap-3">
      <label>功能模式 <select aria-label="功能模式" className="ml-2 max-w-[210px] rounded-lg bg-[#252525] p-2" value={operation} onChange={e=>{onOperation(e.target.value);onSelected([]);}}>
        {modes.map(item=><option key={item.id} value={item.id} disabled={!item.enabled}>{item.label}{!item.enabled?"（尚未開放）":""}</option>)}
      </select></label>
      {kind==="video" && modes.some(m=>m.id==="subject-reference"&&m.enabled) && operation!=="first-last-frame" && operation!=="text-to-video" && operation!=="image-to-video" && <button type="button" className="rounded-lg border border-[#36554d] px-3 py-2 text-[#9aead5]" onClick={()=>open?setOpen(false):load()}>已審核素材{selected.length?` · ${selected.length}`:""}</button>}
      <Link href="/assets" className="text-[#8eaaa4] underline">管理素材</Link>
    </div>
    {operation==="first-last-frame" && <p className="mt-2 text-[#a2b4af]">請在下方依序加入兩張素材：第一張為首幀，第二張為尾幀。</p>}
    {operation==="image-to-video" && <p className="mt-2 text-[#a2b4af]">請在下方加入一張起始圖片。</p>}
    {operation==="subject-reference" && <p className="mt-2 text-[#a2b4af]">真人素材請先在資產庫完成授權與審核，再從「已審核素材」選取。</p>}
    {open && <div className="mt-3 rounded-lg bg-[#101917] p-3">
      {loading && <p>載入中…</p>}{error && <p role="alert" className="text-red-300">{error}</p>}
      {!loading && !error && !assets.length && <p>尚無登錄素材，請先到資產庫新增。</p>}
      <div className="grid gap-2 sm:grid-cols-2">{assets.map(asset=><label key={asset.id} className="flex items-center gap-2 rounded border border-white/10 p-2">
        <input type="checkbox" disabled={asset.status!=="active"||asset.assetType!=="image"} checked={selected.includes(asset.id)} onChange={e=>onSelected(e.target.checked?[...selected,asset.id]:selected.filter(id=>id!==asset.id))}/>
        <span className="min-w-0 truncate">{asset.name}</span><span className="ml-auto shrink-0 text-[#8fa29c]">{asset.status!=="active"?"待審核／不可用":asset.assetType!=="image"?"影片計費待開放":"可使用"}</span>
      </label>)}</div>
      <div className="mt-2 flex items-center gap-3"><button type="button" disabled={loading||page<=1} onClick={()=>load(page-1)}>上一頁</button><span>{page} / {Math.max(1,pages)}</span><button type="button" disabled={loading||page>=pages} onClick={()=>load(page+1)}>下一頁</button><button type="button" onClick={()=>onSelected([])}>清除選取</button></div>
    </div>}
  </div>;
}
