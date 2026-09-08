"use client";
import {useCallback,useEffect,useState} from 'react';
import {providerAssetPage,readProviderAssetResponse,type RegisteredProviderAsset} from '@/lib/providerAssetResponse';
interface Source {id:number;name:string;contentType:string;src:string}
const statuses:Record<string,string>={uploading:'登錄中',processing:'審核處理中',active:'可使用',failed:'未通過',needs_review:'結果待確認，請聯絡管理員'};
export default function ProviderAssetLibrary({sources}:{sources:Source[]}) {
 const [items,setItems]=useState<RegisteredProviderAsset[]>([]),[page,setPage]=useState(1),[pages,setPages]=useState(1),[source,setSource]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{try {const r=await fetch(`/api/provider-assets?page=${page}`);const j=providerAssetPage(await readProviderAssetResponse(r));setItems(j.assets);setPages(j.totalPages);setError('');}catch(e){setError(e instanceof TypeError?'連線失敗，請檢查網路後重新整理。':e instanceof Error?e.message:'載入失敗');}},[page]);
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch server-owned page after navigation
  void load();
 },[load]);
 async function action(url:string,method:string,body?:object) {
  setBusy(true);setError('');
  try {const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});await readProviderAssetResponse(r,true);await load();return true;}catch(e){setError(e instanceof TypeError?'連線中斷，操作結果待確認；請先更新狀態，避免重複登錄。':e instanceof Error?e.message:'操作失敗');return false;}finally{setBusy(false);}
 }
 return <section className="mt-6 rounded-2xl border border-[#29403b] bg-[#101a17] p-4" aria-label="人物參考素材登錄">
  <h2 className="text-base font-semibold">人物參考素材登錄</h2>
  <p className="mt-2 text-xs leading-5 text-[#9caaa5]">將自己的素材送交生成服務審核；狀態為「可使用」後，即可在支援的影片模型選取。登錄不保證通過內容審核，不支援名人或公眾人物肖像。</p>
  <div className="mt-3 flex flex-wrap gap-2"><select aria-label="選擇登錄素材" value={source} onChange={e=>setSource(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-[#202622] p-2 text-sm"><option value="">從資產庫選擇素材</option>{sources.filter(s=>s.contentType!=='image/svg+xml').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button disabled={busy||!source||!consent} onClick={()=>void action('/api/provider-assets','POST',{assetId:Number(source),consent:true})} className="rounded-lg bg-[#7fe5cc] px-3 py-2 text-sm text-black disabled:opacity-40">登錄素材</button></div>
  <label className="mt-3 flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/>我擁有素材與人物肖像授權，並同意將此素材提交至生成服務進行審核與使用。</label>
  {error&&<p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
  <div className="mt-4 space-y-2">{items.map(item=><div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-[#17231e] p-3">
   <div className="min-w-0 flex-1"><p className="break-words text-sm">{item.name}</p><p className={`text-xs ${item.status==='active'?'text-[#7fe5cc]':'text-[#aaa]'}`}>{statuses[item.status]||'狀態待確認'}</p></div>
   <button disabled={busy} className="text-xs underline" onClick={()=>void action(`/api/provider-assets/${item.id}`,'GET')}>更新狀態</button>
   <button disabled={busy} className="text-xs underline" onClick={()=>{const name=prompt('修改素材顯示名稱',item.name);if(name?.trim())void action(`/api/provider-assets/${item.id}`,'PATCH',{name});}}>改名</button>
   <button disabled={busy||item.status==='uploading'||item.status==='needs_review'} className="text-xs text-red-300 underline disabled:opacity-40" onClick={()=>{if(confirm('刪除這個已登錄素材？原始資產庫檔案會保留。'))void action(`/api/provider-assets/${item.id}`,'DELETE');}}>刪除</button>
  </div>)}</div>
  <div className="mt-3 flex items-center justify-between text-xs"><button disabled={busy||page<=1} onClick={()=>setPage(p=>p-1)} className="disabled:opacity-30">上一頁</button><span>{page} / {pages}</span><button disabled={busy||page>=pages} onClick={()=>setPage(p=>p+1)} className="disabled:opacity-30">下一頁</button></div>
 </section>;
}
