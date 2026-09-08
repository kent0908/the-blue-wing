"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Popover from "./Popover";
import { getGenerationModes } from "@/lib/generationModes";
import { providerAssetPage, readProviderAssetResponse, type RegisteredProviderAsset } from "@/lib/providerAssetResponse";

function ReviewedAssets({ selected, onSelected }: { selected: number[]; onSelected: (ids:number[])=>void }) {
  const [assets,setAssets] = useState<RegisteredProviderAsset[]>([]);
  const [error,setError] = useState("");
  const [page,setPage] = useState(1);
  const [pages,setPages] = useState(1);
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch('/api/provider-assets?page='+page+'&pageSize=20')
      .then(readProviderAssetResponse)
      .then(providerAssetPage)
      .then(data => { if (alive) { setAssets(data.assets); setPages(data.totalPages); setError(''); } })
      .catch(error => { if (alive) setError(error instanceof Error ? error.message : '素材載入失敗'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page]);
  const navigate = (value:number) => { setLoading(true); setPage(value); };
  return <div className="max-h-[55dvh] overflow-y-auto p-3 text-xs" aria-label="已審核素材清單">
    <div className="mb-3 flex items-center justify-between gap-3 text-[#d1d1d1]"><span>選擇已審核素材</span><Link href="/assets" className="shrink-0 text-[#aaa] underline">管理素材</Link></div>
    {loading && <p>載入中…</p>}{error && <p role="alert" className="text-red-300">{error}</p>}
    {!loading && !error && !assets.length && <p className="text-[#999]">尚無已登錄素材。</p>}
    <div className="grid gap-2">{!loading && assets.map(asset=><label key={asset.id} className="flex min-w-0 items-center gap-2 rounded border border-white/10 p-2">
      <input type="checkbox" disabled={asset.status!=="active"||asset.assetType!=="image"} checked={selected.includes(asset.id)} onChange={e=>onSelected(e.target.checked?[...selected,asset.id]:selected.filter(id=>id!==asset.id))}/>
      <span className="min-w-0 flex-1 truncate">{asset.name}</span><span className="shrink-0 text-[10px] text-[#999]">{asset.status!=="active"?"未可用":asset.assetType!=="image"?"尚未開放":"可使用"}</span>
    </label>)}</div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={loading||page<=1} onClick={()=>navigate(page-1)}>上一頁</button><span>{page} / {pages}</span><button type="button" disabled={loading||page>=pages} onClick={()=>navigate(page+1)}>下一頁</button><button type="button" onClick={()=>onSelected([])}>清除選取</button></div>
  </div>;
}

/** Compact material picker; function selection lives inside the model menu. */
export default function GenerationModePanel({ model, kind, operation, selected, onSelected }: {
  model: string; kind: "image" | "video"; operation: string;
  selected: number[]; onSelected: (ids:number[])=>void;
}) {
  const allowed = kind === 'video' && getGenerationModes(model,kind).some(item => item.id === 'subject-reference' && item.enabled)
    && !['first-last-frame','text-to-video','image-to-video'].includes(operation);
  if (!allowed) return null;
  return <Popover label="已審核素材" widthClass="w-[340px]" trigger={()=><span>已審核素材{selected.length?' · '+selected.length:''}</span>}>
    {()=><ReviewedAssets selected={selected} onSelected={onSelected}/>}
  </Popover>;
}
