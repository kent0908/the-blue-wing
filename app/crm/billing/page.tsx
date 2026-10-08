"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/locale";
import { Card, Notice, Table, Kpi, LineChart, btnCls, fieldCls, td } from "@/components/crm/ui";
import { useTr, useLocale, setLocaleCookie } from "@/lib/i18n/client";
import { BILLING_ERRORS } from "@/lib/billingMessages";

type Total={currency:string;cost:string;records:number;matched:number;ambiguous:number;non_success:number};
type RecordRow={account_id:string;request_id:string;requested_at:string;model:string;cost:string;currency:string;status:string;match_state:string;local_status:string|null;charge_id:string|null;list_estimate:string|null;discount_estimate:string|null;variance:string|null;usage:Record<string,number>};
type Report={configured:boolean;accountId:string|null;totals:Total[];days:{date:string;currency:string;cost:string;records:number}[];models:{model:string;currency:string;cost:string;records:number}[];records:RecordRow[];coverage:{complete:boolean;gaps:{since:string;until:string}[]};syncs:{id:string;state:string;finished_at:string|null;error_code:string|null;record_count:number|null}[];unbilledLocal:number;localUnidentified:number;hasMore:boolean;range:{dates:string[];since:string;until:string}};
type Filters={from:string;to:string;model:string;requestId:string;page:number};
export function exactAmount(value:string|null|undefined,currency="USD") {
  if(value===null||value===undefined)return "—";
  const [whole,fraction=""] = value.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g,",")}.${fraction.padEnd(6,"0")}`;
}
function initialFilters():Filters {
  const to=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  return {from:new Date(Date.parse(to)-6*86400000).toISOString().slice(0,10),to,model:"",requestId:"",page:1};
}
export default function BillingPage(){
  const tr=useTr(),locale=useLocale(),router=useRouter();
  const [filters,setFilters]=useState(initialFilters),[draft,setDraft]=useState(initialFilters);
  const [data,setData]=useState<Report|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[revision,setRevision]=useState(0);
  const [accounts,setAccounts]=useState<{id:string;name:string;isArchived:boolean}[]>([]);
  const [request,setRequest]=useState(""),[chart,setChart]=useState("line");
  const query=new URLSearchParams({from:filters.from,to:filters.to,model:filters.model,requestId:filters.requestId,page:String(filters.page)}).toString();
  const errorText=(code:string)=>tr(BILLING_ERRORS[code]??"SIRAYA 費用查詢失敗，請稍後重試。");
  useEffect(()=>{
    const controller=new AbortController();
    queueMicrotask(()=>{if(!controller.signal.aborted){setLoading(true);setError("");setData(null);}});
    fetch("/api/crm/billing?"+query,{cache:"no-store",signal:controller.signal}).then(async r=>{
      const j=await r.json();if(!r.ok)throw new Error(j.error?.code??"storage_failed");return j as Report;
    }).then(j=>{if(!controller.signal.aborted)setData(j);}).catch(e=>{if(!controller.signal.aborted)setError(String(e.message));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[query,revision]);
  async function checkAccounts(){
    setBusy(true);setError("");
    try{const r=await fetch("/api/crm/billing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"accounts"})});const j=await r.json();if(!r.ok)throw new Error(j.error?.code??"storage_failed");setAccounts(j.accounts);}
    catch(e){setError(e instanceof Error?e.message:"storage_failed");}finally{setBusy(false);}
  }
  async function sync(){
    setBusy(true);setError("");setNotice("");
    try{
      const r=await fetch("/api/crm/billing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sync",from:draft.from,to:draft.to})});
      const j=await r.json();if(!r.ok)throw new Error(j.error?.code??"storage_failed");
      setFilters({...draft,page:1});setRevision(n=>n+1);setNotice(tr("同步完成：{count} 筆，未重新套用折扣。",{count:j.records}));
    }catch(e){setError(e instanceof Error?e.message:"storage_failed");}finally{setBusy(false);}
  }
  async function lookup(){
    setBusy(true);setError("");setNotice("");
    try{
      const r=await fetch("/api/crm/billing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"lookup",requestId:request.trim()})});
      const j=await r.json();if(!r.ok)throw new Error(j.error?.code??"storage_failed");
      const day=new Date(Date.parse(j.record.timestamp)+8*3600000).toISOString().slice(0,10);
      const next={from:day,to:day,model:"",requestId:request.trim(),page:1};setDraft(next);setFilters(next);setRevision(n=>n+1);
      setNotice(tr("已查到並保存此 Request ID；單筆查詢不代表整日已完成同步。"));
    }catch(e){setError(e instanceof Error?e.message:"storage_failed");}finally{setBusy(false);}
  }
  const fmtTime=(value:string)=>new Date(value).toLocaleString(locale==="ja"?"ja-JP":locale==="en"?"en-US":"zh-TW",{timeZone:"Asia/Taipei",hour12:false});
  const sums=data?.totals??[];
  const dateLabels=data?.range.dates??[];
  const currencies=[...new Set(data?.days.map(d=>d.currency)??[])];
  const currencyCharts=currencies.map(currency=>{
    const entries=data?.days.filter(d=>d.currency===currency)??[];
    const labels=data?.coverage.complete?dateLabels:entries.map(d=>d.date);
    return {currency,labels,series:[{name:currency,color:"#7ff0cd",bars:chart==="bar",values:labels.map(date=>Number(entries.find(d=>d.date===date)?.cost??0)),format:(value:number)=>`${currency} ${value.toFixed(6)}`}]};
  });
  return <div className="space-y-6">
    <header className="max-w-4xl space-y-3"><select aria-label={tr("介面語言")} value={locale} onChange={e=>{setLocaleCookie(e.target.value as Locale);router.refresh();}} className={fieldCls}><option value="zh-Hant">繁體中文</option><option value="ja">日本語</option><option value="en">English</option></select><p className="text-xs tracking-[.2em] text-[#7ff0cd]">SIRAYA / BILLING</p><h1 className="text-2xl font-semibold text-white">{tr("SIRAYA 實際成本對帳")}</h1><p className="text-sm leading-7 text-[#aaa]">{tr("以供應商折扣後計費金額認列。六位小數精確保存，重複同步不重算；不同幣別分開統計。")}</p></header>
    {error&&<Notice kind="err">{errorText(error)}</Notice>}{notice&&<p role="status" className="text-sm text-[#7ff0cd]">{notice}</p>}
    {data&&!data.configured&&<Notice kind="err">{tr(BILLING_ERRORS.not_configured)}</Notice>}
    <Card title={tr("帳號與查詢區間")} sub={tr("日期採台北時間。同步包含指定帳號及子帳號，帳號中其他用途的費用也會列入。")}>{data?.accountId&&<p className="mb-4 break-all font-mono text-xs text-[#aaa]">Account ID · {data.accountId}</p>}<button type="button" className={`${btnCls} mb-4`} disabled={busy||!data?.configured} onClick={()=>void checkAccounts()}>{tr("檢查 Console 帳號")}</button>{accounts.map(a=><p key={a.id} className="mb-2 break-all text-xs text-[#aaa]">{a.name} · {a.id}{a.isArchived?" (archived)":""}</p>)}
      <form onSubmit={e=>{e.preventDefault();setNotice("");setFilters({...draft,page:1});setRevision(n=>n+1);}} className="grid gap-3 md:grid-cols-4">
        <label className="text-xs text-[#aaa]">{tr("開始日期")}<input aria-label={tr("開始日期")} type="date" value={draft.from} onChange={e=>setDraft(d=>({...d,from:e.target.value}))} className={`${fieldCls} mt-2 w-full min-w-0`} disabled={busy}/></label>
        <label className="text-xs text-[#aaa]">{tr("結束日期")}<input aria-label={tr("結束日期")} type="date" value={draft.to} onChange={e=>setDraft(d=>({...d,to:e.target.value}))} className={`${fieldCls} mt-2 w-full min-w-0`} disabled={busy}/></label>
        <label className="text-xs text-[#aaa]">{tr("模型代碼（精確篩選）")}<input value={draft.model} maxLength={160} onChange={e=>setDraft(d=>({...d,model:e.target.value}))} className={`${fieldCls} mt-2 w-full`} disabled={busy}/></label>
        <div className="flex flex-wrap items-end gap-2"><button type="submit" disabled={busy||loading} className={btnCls}>{tr("查詢已保存資料")}</button><button type="button" disabled={busy||!data?.configured} onClick={()=>void sync()} className={btnCls}>{tr(busy?"同步中…":"同步此日期區間")}</button></div>
      </form><p className="mt-3 text-xs leading-6 text-[#888]">{tr("單次同步最多 31 天；今天同步到操作當下。每小時重查最近七天，捕捉延遲計費；更早日期請手動同步。")}</p>
      <form onSubmit={e=>{e.preventDefault();void lookup();}} className="mt-4 flex flex-wrap gap-2"><input aria-label="Request ID" placeholder="Request ID" maxLength={160} value={request} onChange={e=>setRequest(e.target.value)} className={`${fieldCls} min-w-0 flex-1`} disabled={busy}/><button disabled={busy||!request.trim()||!data?.configured} className={btnCls}>{tr("向 SIRAYA 查詢單筆")}</button>{filters.requestId&&<button type="button" onClick={()=>{setDraft(d=>({...d,requestId:""}));setFilters(d=>({...d,requestId:"",page:1}));}} className={btnCls}>{tr("清除 Request ID 篩選")}</button>}</form>
    </Card>
    {loading&&<p role="status" className="text-sm text-[#aaa]">{tr("正在讀取費用紀錄…")}</p>}
    {data&&<>
      <Notice kind={data.coverage.complete?"info":"err"}>{tr(data.coverage.complete?"查詢區間已完整掃描；總額是截至同步時間的供應商紀錄，仍需核對最終帳單。":"查詢區間尚未完整同步。以下僅為已保存費用小計，不是該區間的完整成本。")}</Notice>
      {data.syncs[0]?.state==="failed"&&<Notice kind="err">{tr("最近一次同步失敗：")}{errorText(data.syncs[0].error_code??"storage_failed")}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{sums.map(s=><Kpi key={s.currency} label={tr("已同步費用小計")} value={<span className="break-all text-xl">{exactAmount(s.cost,s.currency)}</span>} sub={tr("{count} 筆供應商計費紀錄",{count:s.records})}/>)}<Kpi label={tr("尚未取得帳單的成功請求")} value={data.unbilledLocal}/><Kpi label={tr("未保存上游 Request ID")} value={data.localUnidentified}/></div>
      <p className="text-xs leading-6 text-[#999]">{tr("成功請求尚無計費紀錄、未保存 Request ID 或未接入供應商時，成本仍未知；不以零元代替。用戶退點不代表供應商退款。")}</p>
      {data.syncs[0]?.finished_at&&<p className="text-xs text-[#999]">{tr("最近同步時間")} · {fmtTime(data.syncs[0].finished_at)}</p>}
      <Card title={tr("每日供應商成本")} sub={tr("未完整同步時僅顯示有資料的日期，空白日期不補零。不同幣別不可相加。") } right={<select aria-label={tr("圖表形式")} value={chart} onChange={e=>setChart(e.target.value)} className={fieldCls}><option value="line">{tr("折線圖")}</option><option value="bar">{tr("長條圖")}</option></select>}>
        {currencyCharts.length?currencyCharts.map(c=><div key={c.currency} className="mb-4"><LineChart labels={c.labels} series={c.series}/></div>):<p className="text-sm text-[#999]">{tr("尚無已同步的計費紀錄。")}</p>}
      </Card>
      <Card title={tr("模型成本彙總")}><Table head={[tr("模型"),tr("請求數"),tr("折扣後實際費用")]}>{data.models.map(r=><tr key={r.model+":"+r.currency}><td className={`${td} break-all`}>{r.model}</td><td className={td}>{r.records}</td><td className={`${td} whitespace-nowrap font-mono`}>{exactAmount(r.cost,r.currency)}</td></tr>)}</Table></Card>
      <Card title={tr("逐筆對帳")} sub={tr("只有上游 Request ID 精確一致才自動配對。未配對紀錄可能來自帳號其他用途或舊版請求；不猜測歸屬。") }><Table minWidth={1080} head={[tr("時間／模型"),"Request ID",tr("實際費用／狀態"),tr("配對／扣點"),tr("牌價／折後估算"),tr("與估算差額")]}>{data.records.map(r=><tr key={r.account_id+":"+r.request_id}><td className={td}>{fmtTime(r.requested_at)}<div className="max-w-64 break-all text-xs text-[#999]">{r.model}</div></td><td className={`${td} max-w-64 break-all font-mono text-xs`}>{r.request_id}<details className="mt-2"><summary>{tr("用量與帳號")}</summary><p>{r.account_id}</p>{Object.entries(r.usage).map(([k,v])=><p key={k}>{k}: {v}</p>)}</details></td><td className={`${td} whitespace-nowrap`}>{exactAmount(r.cost,r.currency)}<div className="text-xs text-[#999]">{r.status}</div></td><td className={td}>{tr(r.match_state==="matched"?"已配對":r.match_state==="ambiguous"?"配對有衝突":"尚未配對")}<div className="text-xs text-[#999]">{r.charge_id??"—"} · {r.local_status=== "refunded"?tr("已退點，仍保留上游成本"):r.local_status??"—"}</div></td><td className={`${td} whitespace-nowrap`}>{exactAmount(r.list_estimate)}<br/>{exactAmount(r.discount_estimate)}</td><td className={`${td} whitespace-nowrap`}>{exactAmount(r.variance)}</td></tr>)}</Table>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={filters.page===1||loading||busy} onClick={()=>setFilters(f=>({...f,page:f.page-1}))} className={btnCls}>{tr("上一頁")}</button><span className="text-xs text-[#999]">{tr("第 {page} 頁，每頁最多 100 筆",{page:filters.page})}</span><button disabled={!data.hasMore||loading||busy} onClick={()=>setFilters(f=>({...f,page:f.page+1}))} className={btnCls}>{tr("下一頁")}</button></div>
      </Card>
    </>}
  </div>;
}
