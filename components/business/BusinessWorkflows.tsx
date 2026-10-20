"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCanvas, IconPlus } from "@/components/Icons";
import { useLocale } from "@/lib/i18n/client";
import { businessWorkflowsCopy, workflowText } from "@/lib/i18n/businessWorkflows";
import type { CanvasGraph, CanvasNode } from "@/lib/canvas/types";
import type { BusinessModel } from "./types";
import styles from "./BusinessStudio.module.css";

interface WorkflowSummary { id: string; name: string; nodeCount: number; updatedAt: string }
type Starter = "blank" | "imageVideo" | "sourceTemplate";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTRA = {
  "zh-Hant": { start: "從哪裡開始", yours: "你的工作流", noMatches: "沒有符合的工作流。", count: "{n} 份草稿", selection: "選擇起步方式" },
  en: { start: "Choose a starting point", yours: "Your workflows", noMatches: "No matching workflows.", count: "{n} drafts", selection: "Choose a starting point" },
  ja: { start: "始め方を選ぶ", yours: "あなたのワークフロー", noMatches: "一致するワークフローはありません。", count: "{n}件の草稿", selection: "始め方を選ぶ" },
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
  const count = starter === "blank" ? 1 : starter === "imageVideo" ? 3 : 2;
  return <svg viewBox="0 0 240 70" aria-hidden="true" className={styles.workflowDrawing}>
    {Array.from({ length: count - 1 }, (_, i) => <g key={`line-${i}`}><path d={`M ${49 + i * 76} 35 C ${76 + i * 76} 35, ${75 + i * 76} 35, ${102 + i * 76} 35`} /><circle cx={49 + i * 76} cy="35" r="3" /><circle cx={102 + i * 76} cy="35" r="3" /></g>)}
    {Array.from({ length: count }, (_, i) => <g key={i}><rect x={13 + i * 76} y="18" width="36" height="34" rx="3" /><path d={`M ${23 + i * 76} 30 h16 m-16 10 h10`} /></g>)}
    {starter === "blank" ? <path d="M104 35h24m-12-12v24" opacity=".6" /> : null}
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

  return <div className={styles.workflowsPage}>
    <header className={styles.workflowsIntro}><p className={styles.workflowEyebrow}>THE BLUE WING / CONNECTED WORKS</p><h2>{t.title}</h2><p>{t.subtitle}</p></header>
    <form className={styles.workflowCreate} onSubmit={createWorkflow} aria-busy={creating}>
      <fieldset disabled={creating} className={styles.workflowStarters}><legend>{extra.start}</legend><div role="group" aria-label={extra.selection} className={styles.workflowStarterGrid}>
        {(["blank", "imageVideo", "sourceTemplate"] as const).map((item, index) => <button key={item} type="button" aria-pressed={starter === item} className={styles.workflowStarter} onClick={() => setStarter(item)}><span className={styles.workflowStarterNumber}>0{index + 1}</span><StarterDrawing starter={item} /><span>{t[item]}</span></button>)}
      </div></fieldset>
      <div className={styles.workflowCreateActions}><label htmlFor={nameId}>{t.name}<input id={nameId} value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder={t.untitled} autoComplete="off" disabled={creating} /></label><button className={styles.workflowPrimary} type="submit" disabled={creating}><IconPlus className={styles.workflowActionIcon} />{creating ? t.loading : t.create}</button></div>
      <p className={styles.workflowDraftNote}>{t.draftOnly}</p>
    </form>
    {error ? <div role="alert" className={styles.workflowError}><p>{error}</p><button type="button" onClick={() => void loadWorkflows()} disabled={loading}>{t.retry}</button></div> : null}
    <section className={styles.workflowCollection} aria-labelledby={`${searchId}-heading`} aria-busy={loading}>
      <div className={styles.workflowCollectionHeading}><div><h3 id={`${searchId}-heading`}>{extra.yours}</h3><p>{workflowText(extra.count, { n: workflows?.length ?? 0 })}</p></div><label htmlFor={searchId}>{t.search}<input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} /></label></div>
      {loading && workflows === null ? <p role="status" className={styles.workflowEmpty}>{t.loading}</p> : visible.length ? <div className={styles.workflowRows}>{visible.map((workflow, index) => <Link key={workflow.id} href={`/business/workflows/${workflow.id}`} className={styles.workflowRow} aria-label={`${t.open} · ${workflow.name}`}><span className={styles.workflowIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><IconCanvas className={styles.workflowRowIcon} /><div className={styles.workflowIdentity}><h4>{workflow.name}</h4><p>{workflowText(t.nodes, { n: workflow.nodeCount })}<span aria-hidden="true"> · </span><span>{t.updated} <time dateTime={workflow.updatedAt}>{dateLabel(workflow.updatedAt)}</time></span></p></div><span className={styles.workflowOpen}>{t.open}<span aria-hidden="true">↗</span></span></Link>)}</div> : <div className={styles.workflowEmpty}>{query ? <p>{extra.noMatches}</p> : <><h4>{t.empty}</h4><p>{t.emptyText}</p></>}</div>}
    </section>
    <footer className={styles.workflowFooter}><p>{t.billing}</p><div><Link href="/business?tab=history">{t.history}<span aria-hidden="true">↗</span></Link><Link href="/business?tab=usage">{t.costs}<span aria-hidden="true">↗</span></Link></div></footer>
  </div>;
}
