"use client";

import { useState } from "react";
import { Card, num } from "./ui";
import { modelLabel } from "@/lib/modelLabel";

type Day = { date: string; attempts: number; success: number; client_error: number; server_error: number; timeout: number; network_error: number; cancelled: number };
type Props = { period: {from:string;to:string}; series: Day[]; models: {model:string;attempts:number}[]; statuses: {http_status:number|null;outcome:string;count:number}[] };
const colors = ["#7ff0cd", "#91baff", "#ffab91"];
const errors = (d: Day) => d.client_error+d.server_error+d.timeout+d.network_error+d.cancelled;

function Bars({ rows }: { rows: {label:string;value:number;color:string}[] }) {
 const max = Math.max(1, ...rows.map(r=>r.value));
 return rows.length ? <div className="space-y-5">{rows.map(r=><div key={r.label}>
  <div className="mb-2 flex items-start justify-between gap-4 text-sm"><span className="min-w-0 break-words text-[#ccc]">{r.label}</span><span className="shrink-0 tabular-nums text-white">{num(r.value)}</span></div>
  <div className="h-2 rounded-full bg-white/5"><div className="h-full rounded-full" style={{width:`${r.value/max*100}%`,background:r.color}} /></div>
 </div>)}</div> : <p className="py-8 text-center text-sm text-[#888]">此篩選區間尚無紀錄</p>;
}

export default function MonitoringCharts({period,series,models,statuses}:Props) {
 const [mode,setMode]=useState<"line"|"bar">("line");
 const [selected,setSelected]=useState("");
 // Plot recorded days only: never imply telemetry before collection began, or on future dates.
 const days=[...series].sort((a,b)=>a.date.localeCompare(b.date));
 const active=days.find(d=>d.date===selected) ?? days.at(-1);
 const max=Math.max(1,...days.map(d=>d.attempts));
 const ceiling=Math.max(4,Math.ceil(max/4)*4);
 const x=(i:number)=>56+(days.length===1 ? 330 : i/(days.length-1)*660);
 const y=(n:number)=>224-n/ceiling*184;
 const metrics=[{label:"HTTP 嘗試",get:(d:Day)=>d.attempts},{label:"HTTP 2xx",get:(d:Day)=>d.success},{label:"錯誤／連線異常",get:errors}];
 const segments: Day[][]=[];
 for(const d of days) {
  const segment=segments.at(-1);
  const last=segment?.at(-1);
  if(last && Date.parse(d.date)-Date.parse(last.date)===86400000) segment!.push(d);
  else segments.push([d]);
 }
 return <div className="space-y-6">
  <Card title="每日用量趨勢" sub={`${period.from} — ${period.to} · 台灣時間 · 單位：次`}>
   <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#bbb]">{metrics.map((m,i)=><span key={m.label} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{background:colors[i]}} />{m.label}</span>)}</div>
    <div className="flex gap-1 rounded-lg border border-white/10 p-1" aria-label="趨勢圖呈現方式">{([['line','折線圖'],['bar','長條圖']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)} className={`rounded-md px-3 py-2 text-xs ${mode===value ? 'bg-[#7ff0cd] text-black':'text-[#aaa] hover:bg-white/10'}`}>{label}</button>)}</div>
   </div>
   {days.length ? <>
    <div className="overflow-x-auto">
     <svg viewBox="0 0 760 270" className="h-64 w-full min-w-[560px]" role="img" aria-label={`每日 HTTP 用量${mode==='line'?'折線':'長條'}圖；下方可選日期查看精確數字`}>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="56" x2="726" y1={y(ceiling*i/4)} y2={y(ceiling*i/4)} stroke="#ffffff12" /><text x="44" y={y(ceiling*i/4)+4} textAnchor="end" fill="#888" fontSize="12">{num(ceiling*i/4)}</text></g>)}
      {mode==='line' && metrics.map((m,j)=>segments.map(s=><polyline key={`${j}:${s[0].date}`} points={s.map(d=>`${x(days.indexOf(d))},${y(m.get(d))}`).join(' ')} fill="none" stroke={colors[j]} strokeWidth={j===0?3:2} strokeDasharray={j===1?'6 4':undefined} />))}
      {days.map((d,i)=><g key={d.date}><title>{d.date}：嘗試 {d.attempts}，2xx {d.success}，錯誤 {errors(d)}</title>
       {metrics.map((m,j)=>mode==='line'?<circle key={j} cx={x(i)} cy={y(m.get(d))} r={j===0?5:3} fill={colors[j]} />:<rect key={j} x={x(i)+(j-1)*Math.min(10,160/days.length)-Math.min(8,140/days.length)/2} y={y(m.get(d))} width={Math.min(8,140/days.length)} height={224-y(m.get(d))} fill={colors[j]} rx="1" />)}
       {(i===0||i===days.length-1||i%Math.max(1,Math.ceil(days.length/6))===0)&&<text x={x(i)} y="250" fill="#999" fontSize="12" textAnchor="middle">{d.date.slice(5)}</text>}
      </g>)}
     </svg>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-white/[.035] p-4 text-sm">
     <label className="text-[#aaa]">查看日期 <select className="ml-2 rounded-lg border border-white/15 bg-[#171717] p-2 text-white" value={active?.date} onChange={e=>setSelected(e.target.value)}>{days.map(d=><option key={d.date}>{d.date}</option>)}</select></label>
     {active && metrics.map((m,i)=><span key={m.label} style={{color:colors[i]}}>{m.label} <strong className="tabular-nums">{num(m.get(active))}</strong></span>)}
    </div>
   </>:<p className="py-16 text-center text-sm text-[#888]">此篩選區間尚無紀錄，暫不繪製趨勢。</p>}
   <p className="mt-4 text-xs leading-6 text-[#888]">僅繪製有紀錄的日期；日期間距依紀錄排列，跨日缺口不連線，也不補成零。2xx 是嘗試數的一部分；錯誤包含 4xx、5xx、逾時、連線失敗與中止，400 不重複加總。手機可左右滑動圖表。</p>
  </Card>
  <div className="grid min-w-0 gap-6 xl:grid-cols-2">
   <Card title="模型用量排行" sub="依 HTTP 嘗試數排序，包含備用 Key 重試。"><Bars rows={[...models].sort((a,b)=>b.attempts-a.attempts).map(m=>({label:modelLabel(m.model),value:m.attempts,color:colors[0]}))} /></Card>
   <Card title="狀態碼分布圖" sub="各狀態獨立計數；橘色表示 HTTP 錯誤或連線異常。"><Bars rows={statuses.map(s=>({label:s.http_status===null?({timeout:'逾時',network_error:'連線失敗',cancelled:'取消／中止'}[s.outcome]??s.outcome):`HTTP ${s.http_status}`,value:s.count,color:s.http_status!==null&&s.http_status<400?colors[1]:colors[2]}))} /></Card>
  </div>
 </div>;
}
