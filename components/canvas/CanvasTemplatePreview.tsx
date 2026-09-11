"use client";
import {useState} from "react";
import Link from "next/link";
import type {OfficialCanvasTemplate} from "@/lib/canvas/officialTemplates";
import {NODE_SPECS} from "@/lib/canvas/types";
import {officialCharacter} from "@/lib/canvas/officialCharacters";
export default function CanvasTemplatePreview({template}:{template:OfficialCanvasTemplate}) {
 const {nodes,edges}=template.graph;
 const [selected,setSelected]=useState(nodes[0].id),[zoom,setZoom]=useState(70);
 const node=nodes.find(n=>n.id===selected)!;
 const width=Math.max(...nodes.map(n=>n.x+350))+40,height=Math.max(...nodes.map(n=>n.y+160))+40;
 const character=officialCharacter(node.data.officialCharacter);
 return <main className="h-full overflow-auto p-4 md:p-8"><Link href="/canvas" className="text-sm text-emerald-300">← 返回智慧畫布</Link><h1 className="mt-4 text-xl font-semibold">{template.name} · 節點預覽</h1><p className="mt-2 text-sm text-neutral-400">{template.description}</p><p className="mt-2 text-sm text-emerald-300">點選節點查看設定、連線與完整提示詞。此預覽不會儲存或執行生成，也不扣點。</p>
 <label className="my-4 flex items-center gap-3 text-sm">縮放 {zoom}%<input aria-label="節點圖縮放" type="range" min="35" max="120" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
 <div className="max-h-[480px] overflow-auto rounded-xl border border-neutral-700 bg-neutral-950"><svg role="group" aria-label="工作流節點與連線" width={width*zoom/100} height={height*zoom/100} viewBox={`0 0 ${width} ${height}`}>
 {edges.map(e=>{const a=nodes.find(n=>n.id===e.fromNode)!,b=nodes.find(n=>n.id===e.toNode)!;return <g key={e.id}><path d={`M${a.x+310},${a.y+70} C${a.x+355},${a.y+70} ${b.x-45},${b.y+70} ${b.x},${b.y+70}`} fill="none" stroke={e.toPort==='image'?'#6ee7b7':'#93c5fd'} strokeWidth="3"/><text x={b.x-36} y={b.y+60} fill="#a3a3a3" fontSize="12">{e.toPort==='image'?'圖片':'文字'}</text></g>;})}
 {nodes.map(n=><g key={n.id} role="button" tabIndex={0} aria-label={`查看${String(n.data.title||NODE_SPECS[n.type].label)}`} onClick={()=>setSelected(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(n.id);}}} style={{cursor:'pointer'}}><rect x={n.x} y={n.y} width="310" height="140" rx="14" fill={n.id===selected?'#123b30':'#202020'} stroke={n.id===selected?'#6ee7b7':'#525252'} strokeWidth="2"/><text x={n.x+16} y={n.y+34} fill="white" fontSize="16">{String(n.data.title||NODE_SPECS[n.type].label).slice(0,22)}</text><text x={n.x+16} y={n.y+70} fill="#a3a3a3" fontSize="14">{NODE_SPECS[n.type].label}</text><text x={n.x+16} y={n.y+104} fill="#6ee7b7" fontSize="13">{String(n.data.model||officialCharacter(n.data.officialCharacter)?.name||'點選查看完整 Prompt')}</text></g>)}
 </svg></div>
 <section className="mt-5 rounded-xl border border-neutral-700 bg-neutral-900 p-5"><label className="text-sm">查看節點<select className="ml-3 max-w-full rounded bg-neutral-800 p-2" value={selected} onChange={e=>setSelected(e.target.value)}>{nodes.map(n=><option key={n.id} value={n.id}>{String(n.data.title||NODE_SPECS[n.type].label)}</option>)}</select></label>
 <div className="mt-4 text-sm leading-7"><p>種類：{NODE_SPECS[node.type].label}</p>{['model','size','quality','seconds','resolution','aspect_ratio'].filter(k=>node.data[k]!=null).map(k=><p key={k}>{({model:'模型',size:'尺寸',quality:'品質',seconds:'秒數',resolution:'解析度',aspect_ratio:'畫面比例'} as Record<string,string>)[k]}：{String(node.data[k])}</p>)}{character&&<p>參考角色：{character.name}（複製後可切換 9 位角色或自己的素材）</p>}<p>輸入：{edges.filter(e=>e.toNode===node.id).map(e=>`${String(nodes.find(n=>n.id===e.fromNode)?.data.title||e.fromNode)} → ${e.toPort==='image'?'參考圖':'Prompt'}`).join('；')||'無上游節點'}</p></div>
 {(node.data.text||node.data.prompt)?<pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-black/40 p-4 text-sm leading-7">{String(node.data.text||node.data.prompt)}</pre>:<p className="mt-3 text-sm text-neutral-400">{node.type==='loadImage'?'此節點提供角色參考圖片。':'提示詞由已連接的文字節點提供，點選上游文字節點查看。'}</p>}</section></main>;
}
