"use client";
import { useState } from 'react';
import { useTr } from '@/lib/i18n/client';
import type { CanvasGraph } from '@/lib/canvas/types';
import { orderedShots, shotPrompt, storyParagraphs, type ShotNotes } from '@/lib/canvas/storyboard';
import { videoConstraintFor, videoResolutionsForModel } from '@/lib/videoModels';
import { modelLabel } from '@/lib/modelLabel';
const field = 'w-full min-w-0 rounded-xl border border-[#354047] bg-[#111719] px-3 py-2.5 text-sm text-[#e0e5e7] focus:border-[#9db7c9] focus:outline-none';
const button = 'whitespace-nowrap rounded-lg border border-[#354047] px-3 py-2 text-xs text-[#c2cdd3] hover:bg-white/5 disabled:opacity-40';
export default function DirectorBoard({ graph, selectedId, onSelect, onChange, onAdd, onDuplicate, onMove, onDelete, onRun, onStage, onSource, onStoryChange, onStorySplit, busy, models, quote }: {
    onStoryChange: (text: string) => void;
    onStorySplit: () => void;
    graph: CanvasGraph;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onChange: (id: string, patch: Record<string, unknown>) => void;
    onAdd: () => void;
    onDuplicate: (id: string) => void;
    onMove: (id: string, direction: number) => void;
    onDelete: (id: string) => void;
    onRun: (id: string) => void;
    onStage: (id: string) => void;
    onSource: (id: string, source: string) => void;
    busy: boolean;
    models: {
        id: string;
        name: string;
    }[];
    quote: (id: string) => number | null;
}) {
    const tr = useTr();
    const story = String(graph.nodes.find(n => n.type === 'text' && n.data.directorStory === true)?.data.text ?? '');
    const shots = orderedShots(graph);
    const shot = shots.find(n => n.id === selectedId) ?? shots[0];
    const [tab, setTab] = useState<'story' | 'camera' | 'sound'>('story');
    const [copyStatus, setCopyStatus] = useState('');
    const notes = (shot?.data.shotNotes ?? {}) as ShotNotes;
    const sources = graph.nodes.filter(n => ['image', 'loadImage', 'director3d'].includes(n.type));
    const sourceId = graph.edges.find(e => e.toNode === shot?.id && e.toPort === 'image')?.fromNode ?? '';
    const promptSource = graph.nodes.find(n => n.id === graph.edges.find(e => e.toNode === shot?.id && e.toPort === 'prompt')?.fromNode);
    const prompt = promptSource ? String(promptSource.data.text ?? '') : String(shot?.data.prompt ?? '');
    const changeNotes = (patch: ShotNotes) => shot && onChange(shot.id, { shotNotes: { ...notes, ...patch } });
    const constraint = videoConstraintFor(String(shot?.data.model ?? ''));
    const resolutions = videoResolutionsForModel(String(shot?.data.model ?? ''));
    const total = shots.reduce((sum, n) => sum + Number(n.data.seconds || 5), 0);
    const price = shot ? quote(shot.id) : null;
    return <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#101416] text-[#e5e9eb]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a3339] px-5 py-4">
      <div><p className="text-[10px] tracking-[.25em] text-[#9badb8]">THE BLUE WING / DIRECTOR</p><h2 className="mt-1 text-lg">{tr("把故事，一鏡一鏡留下。")}</h2></div>
      <div className="flex items-center gap-3"><span className="text-xs text-[#9badb8]">{tr('共 {n} 鏡 · 規劃 {s} 秒', { n: shots.length, s: total })}</span><button className={button} disabled={busy || graph.nodes.length >= 200} onClick={onAdd}>{tr("＋ 新增分鏡")}</button></div>
    </div>
    <details className="shrink-0 border-b border-[#2a3339] px-5 py-3" open={shots.length === 0 ? true : undefined}>
      <summary className="cursor-pointer text-sm text-[#c4d2dc]">{tr("01 故事原稿")}<span className="ml-3 text-xs text-[#91a6b3]">{tr("寫下故事，再依段落安排分鏡")}</span></summary>
      <label className="mt-4 block text-xs text-[#a9b7c0]">{tr("每個鏡頭之間空一行；保留你的文字，不會自動改寫劇情。")}<textarea aria-label={tr("故事原稿")} disabled={busy} className={`${field} mt-2`} rows={5} maxLength={30000} value={story} placeholder={tr("雨後街道，角色看見水面上的藍色羽毛。空一行，開始下一個鏡頭。")} onChange={e => onStoryChange(e.target.value)}/></label>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button className={button} disabled={busy || !story.trim() || graph.nodes.length + storyParagraphs(story).length > 200} onClick={onStorySplit}>{tr('依段落建立 {n} 個分鏡', { n: storyParagraphs(story).length })}</button><span className="text-xs leading-5 text-[#91a6b3]">{tr("只建立分鏡，不生成影片、不扣點；既有分鏡會保留。")}</span></div>
    </details>
    {!shot ? <div className="m-auto max-w-lg p-10 text-center"><h3 className="text-2xl">{tr("從第一個畫面開始")}</h3><p className="my-5 text-sm leading-7 text-[#aebdc5]">{tr("每個分鏡與流程畫布的影片節點同步。加入場景、調整鏡頭、沿用素材，再逐鏡生成。")}</p><button className={button} disabled={busy} onClick={onAdd}>{tr("建立第一鏡")}</button></div> : <>
    <div className="grid shrink-0 grid-cols-1 xl:min-h-0 xl:flex-1 xl:grid-cols-[200px_minmax(0,1fr)_340px]">
      <aside aria-label={tr("分鏡清單")} className="flex gap-2 overflow-auto border-b border-[#2a3339] p-3 xl:flex-col xl:border-r xl:border-b-0">
        {shots.map((n, i) => <button key={n.id} onClick={() => onSelect(n.id)} className={`min-w-36 rounded-xl border p-3 text-left xl:min-w-0 ${shot.id === n.id ? 'border-[#90abbd] bg-[#22323e]' : 'border-[#29343c] bg-[#161d21]'}`}><span className="text-[10px] tracking-wider text-[#9aadb9]">SHOT {String(i + 1).padStart(2, '0')} · {Number(n.data.seconds || 5)} s</span><span className="mt-2 block break-words text-sm">{String(n.data.shotTitle || tr('分鏡 {n}', { n: i + 1 }))}</span><span className="mt-2 block text-xs text-[#a9b7c0]">{n.status === 'done' ? tr('已完成') : n.status === 'running' ? tr('生成中') : n.status === 'error' ? tr('需處理') : tr('待生成')}</span></button>)}
      </aside>
      <main className="min-w-0 p-4 sm:p-6 xl:overflow-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm text-[#a9b7c0]">{tr("分鏡預覽")}</h3><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => onStage(shot.id)}>{tr("3D 擺位與運鏡")}</button><button className={button} disabled={busy || graph.nodes.length >= 200} onClick={() => onDuplicate(shot.id)}>{tr("複製分鏡")}</button></div></div>
        <div className="grid aspect-video place-items-center overflow-hidden rounded-2xl border border-[#303b42] bg-[#090d10]">
          {shot.output?.kind === 'video' ? <video key={shot.output.url} src={shot.output.url} controls playsInline preload="metadata" className="h-full max-h-[50vh] w-full object-contain"/> : <div className="p-6 text-center"><p className="font-serif text-4xl text-[#718797]">{String(shots.indexOf(shot) + 1).padStart(2, '0')}</p><p className="mt-3 text-sm text-[#a7b6c0]">{shot.status === 'running' ? tr('正在生成這個鏡頭') : tr('這個鏡頭，還在構思中')}</p><p className="mt-2 text-xs text-[#7e939f]">{tr("調整設定，或使用 3D 導演台預演構圖。")}</p></div>}
        </div>
        {shot.error && <p role="alert" className="mt-3 rounded-lg bg-red-950/40 p-3 text-sm text-red-200">{shot.error}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><button className={button} disabled={busy || shots.indexOf(shot) === 0} onClick={() => onMove(shot.id, -1)}>{tr("← 提前一鏡")}</button><button className={button} disabled={busy || shots.indexOf(shot) === shots.length - 1} onClick={() => onMove(shot.id, 1)}>{tr("延後一鏡 →")}</button><button className={button} disabled={busy} onClick={() => onDelete(shot.id)}>{tr("刪除分鏡")}</button></div>
        <details className="mt-5 rounded-xl border border-[#303b42] p-4"><summary className="cursor-pointer text-sm">{tr("檢視完整生成提示詞")}</summary><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#aebdc5]">{shotPrompt(prompt, notes) || tr('尚未填寫內容')}</pre><button className={`${button} mt-3`} onClick={async () => { try {
            await navigator.clipboard.writeText(shotPrompt(prompt, notes));
            setCopyStatus(tr('已複製'));
        }
        catch {
            setCopyStatus(tr('無法存取剪貼簿，請手動選取文字'));
        } }}>{tr("複製提示詞")}</button><span role="status" className="ml-3 text-xs">{copyStatus}</span></details>
      </main>
      <fieldset disabled={busy} className="min-w-0 xl:overflow-auto border-t border-[#2a3339] p-4 xl:border-t-0 xl:border-l">
        <label className="block text-xs text-[#a9b7c0]">{tr("分鏡名稱")}<input aria-label={tr("分鏡名稱")} className={`${field} mt-2`} maxLength={120} value={String(shot.data.shotTitle ?? '')} placeholder={tr('分鏡 {n}', { n: shots.indexOf(shot) + 1 })} onChange={e => onChange(shot.id, { shotTitle: e.target.value })}/></label>
        <div className="my-4 flex gap-1 rounded-xl bg-[#080d10] p-1">{([['story', tr('故事')], ['camera', tr('鏡頭')], ['sound', tr('聲音')]] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex-1 rounded-lg py-2 text-xs ${tab === id ? 'bg-[#2a3944]' : 'text-[#9caeb9]'}`}>{tr(label)}</button>)}</div>
        {tab === 'story' && <div className="space-y-4">
          <label className="block text-xs text-[#a9b7c0]">{tr("場景與主要敘事")}<textarea aria-label={tr("場景與主要敘事")} rows={4} className={`${field} mt-2`} value={prompt} onChange={e => onChange(promptSource?.id ?? shot.id, promptSource ? { text: e.target.value } : { prompt: e.target.value })}/></label>
          {promptSource && <p className="text-xs leading-5 text-[#c3b592]">{tr("此內容來自共用文字節點，修改會同步影響相連鏡頭。")}</p>}
          <label className="block text-xs text-[#a9b7c0]">{tr("角色與動作")}<textarea aria-label={tr("角色與動作")} rows={3} className={`${field} mt-2`} value={notes.action ?? ''} onChange={e => changeNotes({ action: e.target.value })} placeholder={tr("誰在什麼位置，做了什麼，最後停在哪裡？")}/></label>
          <label className="block text-xs text-[#a9b7c0]">{tr("參考素材來源")}<select aria-label={tr("參考素材來源")} className={`${field} mt-2`} value={sourceId} onChange={e => onSource(shot.id, e.target.value)}><option value="">{tr("不使用參考素材")}</option>{sources.map(n => <option key={n.id} value={n.id}>{n.type === 'director3d' ? tr('3D 構圖') : n.type === 'image' ? tr('生成圖片') : tr('素材庫')} · {String(n.data.shotTitle ?? n.id)}</option>)}</select></label>
          <p className="text-xs leading-5 text-[#8da0ac]">{tr("可在流程畫布新增素材節點，再讓多個分鏡共用。參考圖不等於精準首尾幀控制。")}</p>
        </div>}
        {tab === 'camera' && <div className="space-y-4"><div className="flex flex-wrap gap-2">{[tr('固定中景'), tr('緩慢推近'), tr('側向跟拍'), tr('環繞半圈'), tr('由遠景拉近特寫')].map(p => <button key={p} className={button} onClick={() => changeNotes({ camera: p })}>{tr(p)}</button>)}</div><label className="block text-xs text-[#a9b7c0]">{tr("構圖與運鏡")}<textarea aria-label={tr("構圖與運鏡")} rows={4} className={`${field} mt-2`} value={notes.camera ?? ''} onChange={e => changeNotes({ camera: e.target.value })}/></label><label className="block text-xs text-[#a9b7c0]">{tr("前後鏡銜接")}<textarea aria-label={tr("前後鏡銜接")} rows={3} className={`${field} mt-2`} value={notes.continuity ?? ''} onChange={e => changeNotes({ continuity: e.target.value })} placeholder={tr("承接前鏡的視線、動作或物件；下一鏡如何開始？")}/></label></div>}
        {tab === 'sound' && <label className="block text-xs text-[#a9b7c0]">{tr("音樂、環境聲與對白")}<textarea aria-label={tr("聲音與節奏")} rows={6} className={`${field} mt-2`} value={notes.sound ?? ''} onChange={e => changeNotes({ sound: e.target.value })} placeholder={tr("例如：先聽見腳步；碰撞時配合鼓點；最後讓風聲留下。")}/><span className="mt-3 block leading-5">{tr("聲音描述將加入提示詞，是否生成音訊依模型能力而定。")}</span></label>}
        <div className="mt-5 space-y-3 border-t border-[#303b42] pt-4"><label className="block text-xs text-[#a9b7c0]">{tr("生成模型")}<select aria-label={tr("生成模型")} className={`${field} mt-2`} value={String(shot.data.model)} onChange={e => { const c = videoConstraintFor(e.target.value); onChange(shot.id, { model: e.target.value, resolution: c.resolutions[0], seconds: Math.max(c.minSeconds, Math.min(Number(shot.data.seconds || 5), c.maxSeconds)) }); }}>{!models.some(m => m.id === shot.data.model) && <option value={String(shot.data.model)}>{modelLabel(String(shot.data.model))}</option>}{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs text-[#a9b7c0]">{tr("秒數")}<input aria-label={tr("分鏡秒數")} type="number" min={constraint.minSeconds} max={constraint.maxSeconds} className={`${field} mt-2`} value={Number(shot.data.seconds || 5)} onChange={e => onChange(shot.id, { seconds: Math.max(constraint.minSeconds, Math.min(constraint.maxSeconds, Number(e.target.value) || constraint.minSeconds)) })}/></label><label className="text-xs text-[#a9b7c0]">{tr("解析度")}<select aria-label={tr("分鏡解析度")} className={`${field} mt-2`} value={String(shot.data.resolution || '480p')} onChange={e => onChange(shot.id, { resolution: e.target.value })}>{resolutions.map(r => <option key={r}>{r}</option>)}</select></label></div>
          <label className="block text-xs text-[#a9b7c0]">{tr("畫幅")}<select aria-label={tr("分鏡畫幅")} className={`${field} mt-2`} value={String(shot.data.aspect_ratio || '16:9')} onChange={e => onChange(shot.id, { aspect_ratio: e.target.value })}>{['16:9', '9:16', '1:1'].map(r => <option key={r}>{r}</option>)}</select></label>
          <button disabled={busy || price === null || !shotPrompt(prompt, notes).trim()} className="w-full rounded-xl bg-[#c5d6e1] px-3 py-3 text-sm font-medium text-[#17222a] disabled:opacity-40" onClick={() => onRun(shot.id)}>{shot.status === 'running' ? tr('生成中…') : tr('生成這一鏡 · {cost}', { cost: price === null ? tr('費率待確認') : tr('約 {n} 點', { n: price }) })}</button>
          <p className="text-xs leading-5 text-[#8da0ac]">{tr("含尚未完成的上游素材費用；已完成的素材沿用。送出前再確認，本次只執行所需節點。")}</p>
        </div>
      </fieldset>
    </div>
    <div aria-label={tr("分鏡時間軸")} className="shrink-0 overflow-x-auto border-t border-[#303b42] bg-[#0d1215] p-3"><div className="flex w-max gap-2">{shots.map((n, i) => { const start = shots.slice(0, i).reduce((sum, s) => sum + Number(s.data.seconds || 5), 0); return <button key={n.id} onClick={() => onSelect(n.id)} style={{ width: Math.max(120, Number(n.data.seconds || 5) * 15) }} className={`rounded-lg border px-3 py-2 text-left ${n.id === shot.id ? 'border-[#9db7c9] bg-[#2b3f4d]' : 'border-[#354047] bg-[#19242b]'}`}><span className="block text-[10px] text-[#a9b7c0]">{start}s — {start + Number(n.data.seconds || 5)}s</span><span className="mt-1 block truncate text-xs">{i + 1}. {String(n.data.shotTitle || tr('未命名分鏡'))}</span></button>; })}</div></div>
    </>}
  </div>;
}
