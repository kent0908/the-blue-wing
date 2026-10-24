"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@/components/Icons";
import { useLocale } from "@/lib/i18n/client";
import { businessWorkflowsCopy, workflowText } from "@/lib/i18n/businessWorkflows";
import type { CanvasGraph, CanvasNode } from "@/lib/canvas/types";
import type { BusinessModel } from "./types";
import styles from "./BusinessWorkflows.module.css";

interface WorkflowSummary { id: string; name: string; nodeCount: number; updatedAt: string }
type Starter = "blank" | "imageVideo" | "sourceTemplate";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTRA = {
  "zh-Hant": { start: "從哪裡開始", yours: "你的工作流", noMatches: "沒有符合的工作流。", count: "{n} 份草稿", filteredCount: "{n} / {total} 份草稿", selection: "選擇起步方式", blankHint: "留一張空白，從自己的節奏開始。", imageVideoHint: "寫下故事，生成畫面，再讓鏡頭動起來。", sourceTemplateHint: "帶入原本的素材，延伸下一個畫面。" },
  en: { start: "Choose a starting point", yours: "Your workflows", noMatches: "No matching workflows.", count: "{n} drafts", filteredCount: "{n} of {total} drafts", selection: "Choose a starting point", blankHint: "An open canvas, ready for your own sequence.", imageVideoHint: "Write a story, make an image, then set it in motion.", sourceTemplateHint: "Bring your source material into the next image." },
  ja: { start: "始め方を選ぶ", yours: "あなたのワークフロー", noMatches: "一致するワークフローはありません。", count: "{n}件の草稿", filteredCount: "全{total}件中{n}件", selection: "始め方を選ぶ", blankHint: "白い余白から、自分の順序でつくる。", imageVideoHint: "物語から一枚をつくり、その先の映像へ。", sourceTemplateHint: "手元の素材から、次の画面を広げる。" },
};

/** Draft creation only. No model, credit or generation endpoint is called by a starter. */
export function businessStarterGraph(starter: Starter, models: BusinessModel[]): CanvasGraph {
  if (starter === "blank") return { nodes: [], edges: [] };
  const image = models.find(model => model.modality === "image" && !model.nsfw && model.supportsReferences);
  const video = models.find(model => model.modality === "video" && !model.nsfw && model.supportsReferences && !!model.seedance)
    ?? models.find(model => model.modality === "video" && !model.nsfw && model.supportsReferences &&
      (model.dedicatedVideo?.capability === "image-to-video" || model.dedicatedVideo?.capability === "subject-reference"));
  const source: CanvasNode = starter === "imageVideo" ? { id: "story", type: "text", x: 70, y: 130, data: { text: "" } }
    : { id: "source", type: "loadImage", x: 70, y: 130, data: { items: [], businessItems: [] } };
  const picture: CanvasNode = { id: "picture", type: "image", x: 430, y: 130, data: { model: image?.id ?? "", prompt: "", size: image?.sizes?.[0] ?? "1024x1024" } };
  const graph: CanvasGraph = { nodes: [source, picture], edges: [{ id: "source-picture", fromNode: source.id, fromPort: "out", toNode: picture.id, toPort: starter === "imageVideo" ? "prompt" : "image" }] };
  if (starter === "imageVideo") {
    graph.nodes.push({ id: "shot", type: "video", x: 790, y: 130, data: { model: video?.id ?? "", prompt: "", seconds: video?.defaultSeconds ?? 5, resolution: video?.resolutions?.[0] ?? "720p", aspect_ratio: video?.aspectRatios?.includes("16:9") ? "16:9" : video?.aspectRatios?.[0] ?? "16:9", generate_audio: false, mode: "freestyle" } });
    graph.edges.push({ id: "picture-shot", fromNode: "picture", fromPort: "out", toNode: "shot", toPort: "image" }, { id: "story-shot", fromNode: "story", fromPort: "out", toNode: "shot", toPort: "prompt" });
  }
  return graph;
}

function StarterDrawing({ starter }: { starter: Starter }) {
  return <svg viewBox="0 0 300 108" aria-hidden="true" className={styles.workflowDrawing}>
    {starter === "blank" ? <><path className={styles.diagramEmpty} d="M61 19h178v70H61z" /><path d="M138 54h24m-12-12v24" /></> : <>
      <path className={styles.diagramWire} d={starter === "imageVideo" ? "M74 54C96 54 96 54 118 54M184 54C206 54 206 54 228 54" : "M110 54C148 54 148 54 186 54"} />
      {starter === "imageVideo" ? <path className={styles.diagramWire} d="M74 54C96 54 88 9 149 9S213 9 213 36S217 54 228 54" /> : null}
      {(starter === "imageVideo" ? [8, 118, 228] : [44, 186]).map((x, index) => <g key={x}>
        <rect className={styles.diagramNode} x={x} y="30" width="66" height="48" rx="4" />
        <path d={index === 0 && starter === "imageVideo" ? `M${x + 13} 44h39m-39 10h30m-30 10h20` : index === 2 ? `M${x + 27} 43l15 11-15 11z` : `M${x + 13} 64V44h39v20zM${x + 19} 58l8-8 14 10`} />
      </g>)}
      {(starter === "imageVideo" ? [74, 118, 184, 228] : [110, 186]).map(x => <circle key={x} className={styles.diagramPort} cx={x} cy="54" r="3" />)}
    </>}
  </svg>;
}

export default function BusinessWorkflows({ models = [] }: { models?: BusinessModel[] }) {
  const locale = useLocale(), t = businessWorkflowsCopy(locale), extra = EXTRA[locale], router = useRouter();
  const nameId = useId(), searchId = useId();
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [loading, setLoading] = useState(false), [creating, setCreating] = useState(false);
  const [error, setError] = useState(""), [name, setName] = useState(""), [query, setQuery] = useState("");
  const [starter, setStarter] = useState<Starter>("blank");
  const createLock = useRef(false), loadSequence = useRef(0);
  const loadWorkflows = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/business/workflows", { cache: "no-store", signal });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.workflows)) throw new Error(t.error);
      const rows = body.workflows as WorkflowSummary[];
      if (rows.some(row => !row || typeof row.id !== "string" || !UUID.test(row.id) || typeof row.name !== "string" || typeof row.nodeCount !== "number" || typeof row.updatedAt !== "string")) throw new Error(t.error);
      if (sequence === loadSequence.current && !signal?.aborted) setWorkflows(rows);
    } catch { if (sequence === loadSequence.current && !signal?.aborted) setError(t.error); }
    finally { if (sequence === loadSequence.current && !signal?.aborted) setLoading(false); }
  }, [t.error]);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the approved workspace's own remote gallery
    void loadWorkflows(controller.signal);
    return () => { controller.abort(); };
  }, [loadWorkflows]);

  const createWorkflow = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createLock.current) return;
    createLock.current = true; setCreating(true); setError("");
    try {
      const response = await fetch("/api/business/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || t.untitled, graph: businessStarterGraph(starter, models) }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || t.error);
      if (typeof body?.workflow?.id !== "string" || !UUID.test(body.workflow.id)) throw new Error(t.error);
      router.push(`/business/workflows/${body.workflow.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t.error); }
    finally { createLock.current = false; setCreating(false); }
  };
  const visible = (workflows ?? []).filter(workflow => workflow.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const dateLabel = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date) : "—";
  };

  return <div className={styles.workflowsPage} data-ui="business-workflows">
    <header className={styles.workflowsIntro}><h2>{t.title}</h2><p>{t.subtitle}</p></header>
    <form className={styles.workflowCreate} onSubmit={createWorkflow} aria-busy={creating}>
      <fieldset disabled={creating} className={styles.workflowStarters}><legend>{extra.start}</legend><div role="group" aria-label={extra.selection} className={styles.workflowStarterGrid}>
        {(["blank", "imageVideo", "sourceTemplate"] as const).map(item => <button key={item} type="button" aria-pressed={starter === item} className={styles.workflowStarter} onClick={() => setStarter(item)}><span className={styles.starterTitle}>{t[item]}<svg className={styles.selectedMark} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.5" /></svg></span><StarterDrawing starter={item} /><span className={styles.starterDescription}>{extra[`${item}Hint`]}</span></button>)}
      </div></fieldset>
      <div className={styles.workflowCreateActions}><label htmlFor={nameId}>{t.name}<input id={nameId} value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder={t.untitled} autoComplete="off" disabled={creating} /></label><button className={styles.workflowPrimary} type="submit" disabled={creating}><IconPlus className={styles.workflowActionIcon} />{creating ? t.loading : t.create}</button></div>
      <p className={styles.workflowDraftNote}>{t.draftOnly}</p>
    </form>
    {error ? <div role="alert" className={styles.workflowError}><p>{error}</p><button type="button" onClick={() => void loadWorkflows()} disabled={loading}>{t.retry}</button></div> : null}
    <section className={styles.workflowCollection} aria-labelledby={`${searchId}-heading`} aria-busy={loading}>
      <div className={styles.workflowCollectionHeading}><div><h3 id={`${searchId}-heading`}>{extra.yours}</h3><p aria-live="polite">{workflows === null ? "—" : workflowText(query.trim() ? extra.filteredCount : extra.count, { n: visible.length, total: workflows.length })}</p></div><label htmlFor={searchId}>{t.search}<input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} /></label></div>
      {loading && workflows === null ? <p role="status" className={styles.workflowEmpty}>{t.loading}</p> : visible.length ? <div className={styles.workflowRows}>{visible.map(workflow => <Link key={workflow.id} href={`/business/workflows/${workflow.id}`} className={styles.workflowRow} aria-label={`${t.open} · ${workflow.name}`}><svg className={styles.workflowRowIcon} viewBox="0 0 64 44" fill="none" aria-hidden="true"><rect x="2" y="3" width="18" height="16" rx="2"/><rect x="44" y="25" width="18" height="16" rx="2"/><path d="M20 11C36 11 28 33 44 33"/><circle cx="20" cy="11" r="2"/><circle cx="44" cy="33" r="2"/></svg><div className={styles.workflowIdentity}><h4>{workflow.name}</h4><p><span>{workflowText(t.nodes, { n: workflow.nodeCount })}</span><span>{t.updated} <time dateTime={workflow.updatedAt}>{dateLabel(workflow.updatedAt)}</time></span></p></div><span className={styles.workflowOpen}>{t.open}<span aria-hidden="true">↗</span></span></Link>)}</div> : <div className={styles.workflowEmpty}>{query.trim() ? <p>{extra.noMatches}</p> : <><h4>{t.empty}</h4><p>{t.emptyText}</p></>}</div>}
    </section>
    <footer className={styles.workflowFooter}><p>{t.billing}</p><div><Link href="/business?tab=history">{t.history}<span aria-hidden="true">↗</span></Link><Link href="/business?tab=usage">{t.costs}<span aria-hidden="true">↗</span></Link></div></footer>
  </div>;
}
