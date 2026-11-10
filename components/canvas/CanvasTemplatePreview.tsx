"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OfficialCanvasTemplate } from "@/lib/canvas/officialTemplates";
import { NODE_SPECS, type CanvasNode } from "@/lib/canvas/types";
import { officialCharacter } from "@/lib/canvas/officialCharacters";
import { useLocale, useTr } from "@/lib/i18n/client";
import { workflowGuideEntry } from "@/lib/i18n/workflowGuideEntry";

export default function CanvasTemplatePreview({ template }: { template: OfficialCanvasTemplate }) {
  const tr = useTr();
  const copy = workflowGuideEntry[useLocale()];
  const router = useRouter();
  const { nodes, edges } = template.graph;
  const [selected, setSelected] = useState(nodes[0].id);
  const [zoom, setZoom] = useState(70);
  const [copying, setCopying] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyLock = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const nodeIndex = new Map(nodes.map(node => [node.id, node]));
  const node = nodeIndex.get(selected) ?? nodes[0];
  const nodeTitle = (item: CanvasNode) => tr(String(item.data.title || NODE_SPECS[item.type].label));
  const width = Math.max(...nodes.map(item => item.x + 350)) + 40;
  const height = Math.max(...nodes.map(item => item.y + 160)) + 40;
  const character = officialCharacter(node.data.officialCharacter);
  const fieldLabels = { model: tr("模型"), size: tr("尺寸"), quality: tr("品質"), seconds: tr("秒數"), resolution: tr("解析度"), aspect_ratio: tr("畫面比例") };

  function focusNode(id: string) {
    const target = nodeIndex.get(id);
    const panel = viewport.current;
    if (!target || !panel) return;
    setSelected(id);
    panel.scrollTo({
      left: (target.x + 155) * zoom / 100 - panel.clientWidth / 2,
      top: (target.y + 70) * zoom / 100 - panel.clientHeight / 2,
    });
  }

  async function clone() {
    if (copyLock.current) return;
    copyLock.current = true;
    setCopying(true);
    setCopyFailed(false);
    try {
      const response = await fetch(`/api/canvas/templates/${template.id}/clone`, { method: "POST" });
      if (response.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/canvas/templates/${template.id}`)}`);
        return;
      }
      const result = await response.json();
      if (!response.ok || typeof result?.workflowId !== "string" || !/^\d+$/.test(result.workflowId)) throw new Error();
      router.push(`/canvas/${result.workflowId}`);
    } catch {
      copyLock.current = false;
      setCopying(false);
      setCopyFailed(true);
    }
  }

  return <div className="h-full overflow-auto px-4 py-6 text-[#e8e6df] md:px-8 md:py-9">
    <div className="mx-auto max-w-[1200px]">
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[#b9d4ce]">
        <Link className="inline-flex min-h-11 items-center hover:underline" href="/canvas">{tr("← 返回智慧畫布")}</Link>
        <Link className="inline-flex min-h-11 items-center hover:underline" href="/canvas/guide">{copy.guide}</Link>
      </nav>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-[#343831] pb-5">
        <div className="min-w-0 max-w-2xl">
          <p className="mb-1 text-xs text-[#b3b9ad]">{tr("· 節點預覽").replace(/^·\s*/, "")}</p>
          <h1 className="font-serif text-3xl leading-tight [text-wrap:balance] md:text-4xl">{tr(template.name)}</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#c3c7bc] [text-wrap:pretty]">{tr(template.description)}</p>
        </div>
        <div className="min-w-0">
          <button type="button" onClick={() => void clone()} disabled={copying} className="min-h-11 rounded-md bg-[#d8e7d7] px-4 py-2 text-sm font-semibold text-[#172218] hover:bg-[#e6f2e5] focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60">
            {copying ? tr("複製中…") : tr("複製到我的畫布")}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-[#b3b9ad]">{copy.copyNote}</p>
          {copyFailed && <p className="mt-2 text-sm text-[#ffc2b7]" role="alert">{tr("複製失敗")}</p>}
        </div>
      </header>
      <p className="mt-4 text-sm leading-relaxed text-[#b9d4ce] [text-wrap:pretty]">{tr("點選節點查看設定、連線與完整提示詞。此預覽不會儲存或執行生成，也不扣點。")}</p>
      <label className="my-3 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {tr("縮放")} {zoom}%
        <input aria-label={tr("節點圖縮放")} type="range" min="25" max="120" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
      </label>
      <div ref={viewport} className="max-h-[440px] max-w-full overflow-auto rounded-md border border-[#343831] bg-[#101411]">
        <svg role="group" aria-label={tr("工作流節點與連線")} width={width * zoom / 100} height={height * zoom / 100} viewBox={`0 0 ${width} ${height}`}>
          {edges.map(edge => {
            const from = nodeIndex.get(edge.fromNode)!;
            const to = nodeIndex.get(edge.toNode)!;
            const isImage = edge.toPort === "image";
            const color = isImage ? "#92c9a6" : "#a4c3de";
            const targetY = to.y + (isImage ? 93 : 50);
            return <g key={edge.id}>
              <path d={`M${from.x + 310},${from.y + 70} C${from.x + 365},${from.y + 70} ${to.x - 55},${targetY} ${to.x},${targetY}`} fill="none" stroke={color} strokeWidth="3" />
            </g>;
          })}
          {nodes.map(item => <g key={item.id} role="button" tabIndex={0} aria-pressed={item.id === node.id} aria-label={tr("查看{t}", { t: nodeTitle(item) })} onClick={() => setSelected(item.id)} onKeyDown={event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setSelected(item.id);
          }} className="cursor-pointer">
            <rect x={item.x} y={item.y} width="310" height="140" rx="12" fill={item.id === node.id ? "#1d3327" : "#1b211e"} stroke={item.id === node.id ? "#b8ddc3" : "#535c54"} strokeWidth="2" />
            <foreignObject x={item.x + 16} y={item.y + 16} width="278" height="30" className="pointer-events-none">
              <p className="truncate text-base leading-6 text-[#f1f1eb]">{nodeTitle(item)}</p>
            </foreignObject>
            <text x={item.x + 16} y={item.y + 70} fill="#b9c4b9" fontSize="14">{tr(NODE_SPECS[item.type].label)}</text>
            <text x={item.x + 16} y={item.y + 104} fill="#b8ddc3" fontSize="13">{String(item.data.model || officialCharacter(item.data.officialCharacter)?.name || tr("點選查看完整 Prompt"))}</text>
          </g>)}
        </svg>
      </div>
      <section className="mt-5 rounded-md border border-[#343831] bg-[#171c19] p-4 md:p-5" aria-label={copy.settings}>
        <label className="grid max-w-xl gap-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          {tr("查看節點")}
          <select className="min-h-11 min-w-0 max-w-full rounded border border-[#555e55] bg-[#232a25] px-2" value={node.id} onChange={event => focusNode(event.target.value)}>
            {nodes.map(item => <option key={item.id} value={item.id}>{nodeTitle(item)}</option>)}
          </select>
        </label>
        <div className="mt-4 break-words text-sm leading-7">
          <p>{tr("種類：")}{tr(NODE_SPECS[node.type].label)}</p>
          {Object.entries(fieldLabels).filter(([key]) => node.data[key] != null).map(([key, label]) => <p key={key}>{label} · {String(node.data[key])}</p>)}
          {character && <p>{tr("參考角色：")}{tr(character.name)}{tr("（複製後可切換 9 位角色或自己的素材）")}</p>}
          <p>{tr("輸入：")}{edges.filter(edge => edge.toNode === node.id).map(edge => `${nodeTitle(nodeIndex.get(edge.fromNode)!)} → ${edge.toPort === "image" ? tr("參考圖") : "Prompt"}`).join(" · ") || tr("無上游節點")}</p>
        </div>
        {node.data.text || node.data.prompt
          ? <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-black/30 p-3 font-sans text-sm leading-7 md:p-4">{String(node.data.text || node.data.prompt)}</pre>
          : <p className="mt-3 text-sm text-[#b3b9ad]">{node.type === "loadImage" ? tr("此節點提供角色參考圖片。") : tr("提示詞由已連接的文字節點提供，點選上游文字節點查看。")}</p>}
      </section>
    </div>
  </div>;
}
