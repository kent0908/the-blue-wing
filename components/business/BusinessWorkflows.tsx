"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@/components/Icons";
import { useLocale } from "@/lib/i18n/client";
import { businessWorkflowsCopy, workflowText } from "@/lib/i18n/businessWorkflows";
import type { Locale } from "@/lib/i18n/locale";
import { shortDramaTemplate } from "@/lib/canvas/shortDramaTemplate";
import type { CanvasGraph, CanvasNode } from "@/lib/canvas/types";
import type { BusinessModel } from "./types";
import styles from "./BusinessWorkflows.module.css";

interface WorkflowSummary { id: string; name: string; nodeCount: number; updatedAt: string; version: string }
const STARTERS = ["blank", "imageVideo", "sourceTemplate", "shortDrama"] as const;
type Starter = typeof STARTERS[number];
type DraftDialog = { kind: "create" } | { kind: "rename"; workflow: WorkflowSummary };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[a-f0-9]{32}$/;
const validSummary = (row: WorkflowSummary) => row && typeof row.id === "string" && UUID.test(row.id) &&
  typeof row.name === "string" && Number.isInteger(row.nodeCount) && row.nodeCount >= 0 &&
  typeof row.updatedAt === "string" && Number.isFinite(Date.parse(row.updatedAt)) &&
  typeof row.version === "string" && VERSION.test(row.version);

function wideFrameSize(model: BusinessModel) {
  return model.sizes?.find(size => {
    const [width, height] = size.split("x").map(Number);
    return width > 0 && height > 0 && Math.abs(width / height - 16 / 9) < 0.03;
  });
}

function businessDramaGraph(models: BusinessModel[], locale: Locale): CanvasGraph {
  const { graph } = shortDramaTemplate(locale);
  const guide = graph.nodes.find(node => node.id === "guide");
  if (guide) guide.data.text = businessWorkflowsCopy(locale).dramaWorkflowNote;
  const imageNodes = graph.nodes.filter(node => node.type === "image");
  const videoNodes = graph.nodes.filter(node => node.type === "video");
  const imageModels = models.filter(model => model.modality === "image" && !model.nsfw &&
    model.supportsReferences && (model.maxReferenceImages ?? 0) >= 1 && wideFrameSize(model));
  const image = imageModels.find(model => model.id === imageNodes[0]?.data.model) ?? imageModels[0];
  const videoModels = models.filter(model => model.modality === "video" && !model.nsfw && model.supportsReferences &&
    !model.nativeAudioOnly && model.aspectRatios?.includes("16:9") && model.resolutions?.length &&
    (model.seedance?.modes.includes("image-to-video") ||
      model.dedicatedVideo?.capability === "image-to-video" && model.dedicatedVideo.modes.includes("image-to-video")) &&
    videoNodes.every(node => {
      const seconds = Number(node.data.seconds);
      return seconds >= (model.minSeconds ?? 2) && seconds <= (model.maxSeconds ?? 15) &&
        (!model.secondsOptions?.length || model.secondsOptions.includes(seconds));
    }));
  const video = videoModels.find(model => model.id === videoNodes[0]?.data.model) ??
    videoModels.find(model => model.seedance) ?? videoModels[0];
  for (const node of imageNodes) {
    node.data.model = image?.id ?? "";
    const size = String(node.data.size ?? "");
    if (image && !image.sizes?.includes(size)) node.data.size = wideFrameSize(image);
    if (!image?.imageControls?.some(control => control.key === "quality" &&
      control.options?.includes(String(node.data.quality)))) delete node.data.quality;
  }
  for (const node of videoNodes) {
    node.data.model = video?.id ?? "";
    const resolution = String(node.data.resolution ?? "");
    if (video && !video.resolutions?.includes(resolution)) node.data.resolution = video.resolutions?.[0];
    node.data.generate_audio = false;
    node.data.mode = "image-to-video";
  }
  return graph;
}

/** Draft creation only. No model, credit or generation endpoint is called by a starter. */
export function businessStarterGraph(starter: Starter, models: BusinessModel[], locale: Locale = "zh-Hant"): CanvasGraph {
  if (starter === "blank") return { nodes: [], edges: [] };
  if (starter === "shortDrama") return businessDramaGraph(models, locale);
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
    {starter === "shortDrama" ? <>
      <rect className={styles.diagramNode} x="18" y="38" width="59" height="32" rx="4" />
      <path className={styles.diagramWire} d="M77 54h47m0-42v84M124 12h73m-73 28h73m-73 28h73m-73 28h73" />
      {[12, 40, 68, 96].map(y => <g key={y}><rect className={styles.diagramNode} x="197" y={y - 10} width="85" height="20" rx="3" /><path d={`M234 ${y - 5}l9 5-9 5z`} /></g>)}
      <circle className={styles.diagramPort} cx="77" cy="54" r="4" />
    </> : starter === "blank" ? <><path className={styles.diagramEmpty} d="M61 19h178v70H61z" /><path d="M138 54h24m-12-12v24" /></> : <>
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
  const locale = useLocale(), t = businessWorkflowsCopy(locale), router = useRouter();
  const nameId = useId(), searchId = useId(), dialogTitle = useId();
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [listError, setListError] = useState(false), [formError, setFormError] = useState("");
  const [name, setName] = useState(""), [query, setQuery] = useState("");
  const [starter, setStarter] = useState<Starter>("blank");
  const [draftDialog, setDraftDialog] = useState<DraftDialog | null>(null);
  const [renameStale, setRenameStale] = useState(false), [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null), nameRef = useRef<HTMLInputElement>(null), dismissRef = useRef<HTMLButtonElement>(null);
  const saveLock = useRef(false), loadSequence = useRef(0);
  const loadWorkflows = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    setLoading(true); setListError(false);
    try {
      const response = await fetch("/api/business/workflows", { cache: "no-store", signal });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.workflows) || !body.workflows.every(validSummary)) throw new Error();
      if (sequence === loadSequence.current && !signal?.aborted) setWorkflows(body.workflows);
    } catch { if (sequence === loadSequence.current && !signal?.aborted) setListError(true); }
    finally { if (sequence === loadSequence.current && !signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the approved workspace's own remote gallery
    void loadWorkflows(controller.signal);
    return () => { controller.abort(); };
  }, [loadWorkflows]);

  useEffect(() => {
    if (!draftDialog) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    if (draftDialog.kind === "rename") {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
    return () => { if (dialog.open) dialog.close(); };
  }, [draftDialog]);
  useEffect(() => { if (renameStale) dismissRef.current?.focus(); }, [renameStale]);

  const openDialog = (next: DraftDialog, initialStarter: Starter = "blank") => {
    setName(next.kind === "rename" ? next.workflow.name : "");
    setStarter(initialStarter);
    setFormError("");
    setRenameStale(false);
    setNotice("");
    setDraftDialog(next);
  };
  const closeDialog = () => {
    dialogRef.current?.close();
    setDraftDialog(null);
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftDialog || saveLock.current || renameStale) return;
    const renamed = draftDialog.kind === "rename" ? draftDialog.workflow : null;
    const nextName = name.trim() || (renamed ? "" : starter === "shortDrama" ? t.shortDrama : t.untitled);
    if (!nextName) { setFormError(t.nameRequired); nameRef.current?.focus(); return; }
    if (renamed?.name === nextName) { closeDialog(); return; }
    const fallback = renamed ? t.renameFailed : t.createFailed;
    saveLock.current = true; setSaving(true); setFormError("");
    try {
      const graph = renamed ? null : businessStarterGraph(starter, models, locale);
      const response = await fetch(renamed ? `/api/business/workflows/${renamed.id}` : "/api/business/workflows", {
        method: renamed ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(renamed ? { name: nextName, version: renamed.version } : { name: nextName, graph }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (renamed && (response.status === 404 || response.status === 409)) {
          setRenameStale(true);
          void loadWorkflows();
          setFormError(t.renameConflict);
        } else {
          setFormError(typeof body?.error?.message === "string" ? body.error.message : fallback);
        }
        return;
      }
      const saved = { ...body?.workflow, nodeCount: renamed?.nodeCount ?? graph?.nodes.length } as WorkflowSummary;
      if (!validSummary(saved) || (renamed && saved.id !== renamed.id)) throw new Error();
      setWorkflows(rows => rows === null ? null : [saved, ...rows.filter(row => row.id !== saved.id)]);
      closeDialog();
      if (renamed) {
        // A rename can change whether the row matches the old search.
        if (!saved.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))) setQuery("");
        setNotice(t.renamed);
      } else {
        router.push(`/business/workflows/${saved.id}`);
      }
      // Ensure any older list request cannot replace the mutation result.
      void loadWorkflows();
    } catch { setFormError(fallback); }
    finally { saveLock.current = false; setSaving(false); }
  };
  const searchTerm = query.trim().toLocaleLowerCase(locale);
  const visible = (workflows ?? []).filter(workflow => workflow.name.toLocaleLowerCase(locale).includes(searchTerm));
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dateLabel = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "—";
  };

  return <div className={styles.workflowsPage} data-ui="business-workflows">
    <section aria-labelledby={`${searchId}-heading`} aria-busy={loading}>
      <header className={styles.workflowCollectionHeading}>
        <div><h2 id={`${searchId}-heading`}>{t.title}</h2>{workflows !== null ? <p aria-live="polite">{workflowText(searchTerm ? t.filteredCount : workflows.length === 1 ? t.singleDraft : t.count, { n: visible.length, total: workflows.length })}</p> : null}</div>
        <label className={styles.search} htmlFor={searchId}><span className={styles.screenReader}>{t.search}</span><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} disabled={workflows === null} /></label>
        <button className={styles.workflowPrimary} type="button" onClick={() => openDialog({ kind: "create" })}><IconPlus className={styles.workflowActionIcon} />{t.create}</button>
      </header>
      <div className={styles.featuredTemplate}>
        <div>
          <p className={styles.templateLabel}>{t.officialDrama}</p>
          <h3>{t.shortDrama}</h3>
          <p className={styles.templateDescription}>{t.dramaDescription}</p>
        </div>
        <div className={styles.templateActions}>
          <Link href="/canvas/guide" className={styles.workflowSecondary}>{t.workflowGuide}</Link>
          <button className={styles.workflowSecondary} type="button" onClick={() => openDialog({ kind: "create" }, "shortDrama")}>{t.copyDrama}</button>
        </div>
      </div>
      <p role="status" className={notice ? styles.notice : styles.screenReader}>{notice}</p>
      {listError ? <div role="alert" className={styles.workflowError}><p>{t.error}</p><button className={styles.workflowSecondary} type="button" onClick={() => void loadWorkflows()} disabled={loading}>{t.retry}</button></div> : null}
      {workflows === null ? (loading ? <p role="status" className={styles.workflowEmpty}>{t.loading}</p> : null) : visible.length ? (
        <ul className={styles.workflowRows}>
          {visible.map(workflow => <li key={workflow.id} className={styles.workflowRow}>
            <Link href={`/business/workflows/${workflow.id}`} className={styles.rowLink} aria-label={`${t.open}: ${workflow.name}`}>
              <div className={styles.workflowIdentity}><h3>{workflow.name}</h3><p><span>{workflowText(workflow.nodeCount === 1 ? t.singleNode : t.nodes, { n: workflow.nodeCount })}</span><time dateTime={workflow.updatedAt}>{dateLabel(workflow.updatedAt)}</time></p></div>
              <span className={styles.workflowOpen}>{t.open}<span aria-hidden="true">→</span></span>
            </Link>
            <button type="button" className={styles.workflowSecondary} onClick={() => openDialog({ kind: "rename", workflow })} aria-label={`${t.rename}: ${workflow.name}`}>{t.rename}</button>
          </li>)}
        </ul>
      ) : <p className={styles.workflowEmpty}>{searchTerm ? t.noMatches : t.empty}</p>}
    </section>
    {draftDialog ? <dialog ref={dialogRef} className={styles.workflowDialog} aria-labelledby={dialogTitle} onCancel={event => { event.preventDefault(); if (!saveLock.current) closeDialog(); }}>
      <h2 id={dialogTitle}>{draftDialog.kind === "create" ? t.create : t.rename}</h2>
      <form onSubmit={saveDraft} aria-busy={saving}>
        {draftDialog.kind === "create" ? <fieldset disabled={saving} className={styles.workflowStarters}><legend>{t.starter}</legend>
          {STARTERS.map(item => <label key={item} className={styles.workflowStarter}>
            <input type="radio" name="starter" value={item} checked={starter === item} onChange={() => setStarter(item)} /><span>{t[item]}</span><StarterDrawing starter={item} />
          </label>)}
        </fieldset> : null}
        {draftDialog.kind === "create" && starter === "shortDrama" && <p className={styles.templateHint}>{t.dramaModels}</p>}
        <label className={styles.nameField} htmlFor={nameId}>{t.name}<input ref={nameRef} id={nameId} value={name} onChange={event => { setName(event.target.value); if (!renameStale) setFormError(""); }} maxLength={120} placeholder={starter === "shortDrama" ? t.shortDrama : t.untitled} autoComplete="off" enterKeyHint="done" disabled={saving || renameStale} required={draftDialog.kind === "rename"} /></label>
        {formError ? <p role="alert" className={styles.formError}>{formError}</p> : null}
        <div className={styles.dialogActions}>
          <button ref={dismissRef} type="button" className={styles.workflowSecondary} disabled={saving} onClick={closeDialog}>{renameStale ? t.close : t.dismiss}</button>
          {!renameStale ? <button className={styles.workflowPrimary} type="submit" disabled={saving}>{saving ? (draftDialog.kind === "create" ? t.creating : t.renaming) : draftDialog.kind === "create" ? t.createAndOpen : t.saveName}</button> : null}
        </div>
      </form>
    </dialog> : null}
  </div>;
}
