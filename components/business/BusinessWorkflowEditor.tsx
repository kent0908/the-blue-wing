"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { useLocale } from "@/lib/i18n/client";
import { businessWorkflowsCopy, workflowText } from "@/lib/i18n/businessWorkflows";
import { defaultNodeData, type BusinessCanvasImageItem, type CanvasGraph, type CanvasNode } from "@/lib/canvas/types";
import type { CanvasEditorRuntime } from "@/lib/canvas/runtime";
import { createBusinessCanvasRunner } from "@/lib/canvas/businessEngine";
import { assertBusinessCanvasPreflight } from "@/lib/canvas/businessPreflight";
import BusinessAssets from "./BusinessAssets";
import BusinessDialog from "./BusinessDialog";
import BusinessGenerationReceipt from "./BusinessGenerationReceipt";
import type { BusinessAccess, BusinessGeneration, BusinessModel } from "./types";
import styles from "./BusinessWorkflowEditor.module.css";

const CanvasEditor = dynamic(() => import("@/components/canvas/CanvasEditor"), { ssr: false });
interface Workflow { id: string; name: string; graph: CanvasGraph; version: string }
interface Workspace { access: BusinessAccess; models: BusinessModel[]; workflow: Workflow }

function NodeFields({ node, models, onChange }: { node: CanvasNode; models: BusinessModel[]; onChange: (patch: Record<string, unknown>) => void }) {
  const t = businessWorkflowsCopy(useLocale());
  const [picking, setPicking] = useState(false);
  const items = (node.data.businessItems ?? []) as BusinessCanvasImageItem[];
  const choices = models.filter(model => model.modality === node.type);
  const selected = choices.find(model => model.id === node.data.model);
  const audioAvailable = !selected?.nativeAudioResolutions?.length || selected.nativeAudioResolutions.includes(String(node.data.resolution ?? selected.resolutions?.[0]));
  const promptLimit = selected?.dedicatedVideo?.cjkPromptMaxChars && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(node.data.prompt ?? "")) ? selected.dedicatedVideo.cjkPromptMaxChars : selected?.promptMaxChars ?? 12000;
  const field = (label: string, content: React.ReactNode) => <label className={styles.field}>{label}{content}</label>;
  if (node.type === "loadImage") return <div className={styles.fields}>
    <button type="button" className={styles.button} onClick={() => setPicking(true)}>{t.choose}</button>
    <p className={styles.hint}>{t.sourceHint}</p>
    <p className={styles.hint}>{items.length} / 16 · {t.sourceLimit}</p>
    {items.length ? items.map(item => <div className={styles.source} key={item.uploadId}><span>{item.name}</span><button type="button" title={t.remove} aria-label={`${t.remove}: ${item.name}`} onClick={() => onChange({ businessItems: items.filter(source => source.uploadId !== item.uploadId), items: [] })}>×</button></div>) : <p>{t.none}</p>}
    {picking && <BusinessDialog title={t.references} onClose={() => setPicking(false)}>
      <BusinessAssets imageOnly compact selectedIds={items.map(item => item.uploadId)} canSelect={asset => items.some(item => item.uploadId === asset.uploadId) || items.length < 16} onSelect={asset => {
        if (!asset.uploadId || !asset.storageReady) return;
        const id = asset.uploadId;
        const next = items.some(item => item.uploadId === id) ? items.filter(item => item.uploadId !== id) : [...items, { uploadId: id, src: `/api/business/provider-assets/uploads/${id}/preview`, name: asset.name }];
        onChange({ businessItems: next.slice(0, 16), items: [] });
      }} />
      <button type="button" className={styles.button} onClick={() => setPicking(false)}>{t.done}</button>
    </BusinessDialog>}
  </div>;
  return <div className={styles.fields}>
    {field(t.model, <select value={String(node.data.model ?? "")} onChange={event => {
      const model = choices.find(item => item.id === event.target.value);
      if (model) onChange(node.type === "image" ? { model: model.id, size: model.sizes?.[0] ?? "" } : { model: model.id, seconds: model.defaultSeconds ?? model.secondsOptions?.find(value => value > 0) ?? 5, resolution: model.resolutions?.[0] ?? "", aspect_ratio: model.aspectRatios?.includes("16:9") ? "16:9" : model.aspectRatios?.[0] ?? "16:9", generate_audio: !!model.nativeAudioOnly, mode: "freestyle" });
    }}><option value="" disabled>{t.model}</option>{choices.map(model => <option key={model.id} value={model.id}>{model.displayName}</option>)}</select>)}
    {!selected && <p role="alert">{t.unavailableModel}</p>}
    {field(t.prompt, <textarea rows={4} maxLength={promptLimit} placeholder={t.promptHint} value={String(node.data.prompt ?? "")} onChange={event => onChange({ prompt: event.target.value })} />)}
    {node.type === "image" && selected?.sizes?.length ? field(t.size, <select value={String(node.data.size ?? selected.sizes[0])} onChange={event => onChange({ size: event.target.value })}>{selected.sizes.map(size => <option key={size}>{size}</option>)}</select>) : null}
    {node.type === "video" && selected && <>
      {field(t.seconds, selected.secondsOptions?.length ? <select value={Number(node.data.seconds ?? selected.defaultSeconds ?? selected.secondsOptions[0])} onChange={event => onChange({ seconds: Number(event.target.value) })}>{selected.secondsOptions.filter(value => value > 0).map(value => <option key={value} value={value}>{value}</option>)}</select> : <input type="number" min={selected.minSeconds ?? 2} max={selected.maxSeconds ?? 15} step="1" value={Number(node.data.seconds ?? selected.defaultSeconds ?? 5)} onChange={event => onChange({ seconds: Number(event.target.value) })} />)}
      {selected.resolutions?.length ? field(t.resolution, <select value={String(node.data.resolution ?? selected.resolutions[0])} onChange={event => onChange({ resolution: event.target.value, generate_audio: selected.nativeAudioOnly || node.data.generate_audio === true && (!selected.nativeAudioResolutions?.length || selected.nativeAudioResolutions.includes(event.target.value)) })}>{selected.resolutions.map(value => <option key={value}>{value}</option>)}</select>) : null}
      {selected.aspectRatios?.length ? field(t.aspect, <select value={String(node.data.aspect_ratio ?? selected.aspectRatios[0])} onChange={event => onChange({ aspect_ratio: event.target.value })}>{selected.aspectRatios.map(value => <option key={value}>{value}</option>)}</select>) : null}
      {selected.supportsAudio && <label className={styles.checkbox}><input type="checkbox" checked={selected.nativeAudioOnly || node.data.generate_audio === true} disabled={selected.nativeAudioOnly || !audioAvailable} onChange={event => onChange({ generate_audio: event.target.checked })} />{t.audio}{!audioAvailable && ` · ${selected.nativeAudioResolutions?.join(" / ")}`}</label>}
    </>}
    <p className={styles.hint}>{t.sourceHint}</p>
  </div>;
}

export default function BusinessWorkflowEditor({ id }: { id: string }) {
  const locale = useLocale(), t = businessWorkflowsCopy(locale);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<BusinessGeneration[]>([]);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const accessResponse = await fetch("/api/business/access", { cache: "no-store", signal });
      const access = await accessResponse.json();
      if (!accessResponse.ok || access.account?.status !== "approved") throw new Error(t.approval);
      const [saved, catalog] = await Promise.all([
        fetch(`/api/business/workflows/${encodeURIComponent(id)}`, { cache: "no-store", signal }),
        access.keyConfigured ? fetch("/api/business/models", { cache: "no-store", signal }) : Promise.resolve(null),
      ]);
      const body = await saved.json();
      if (!saved.ok || !body.workflow) throw new Error(body.error?.message ?? t.error);
      const models = catalog?.ok ? (await catalog.json()).models ?? [] : [];
      if (signal?.aborted) return;
      setError("");
      setWorkspace({ access, workflow: body.workflow, models: models.filter((model: BusinessModel) => !model.nsfw || access.adultVerified) });
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : t.error); }
  }, [id, t]);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the authenticated remote document on mount; writes occur after network I/O
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const rememberJob = useCallback((job: BusinessGeneration) => setJobs(current => [job, ...current.filter(item => item.id !== job.id)].slice(0, 30)), []);
  const runtime = useMemo<CanvasEditorRuntime | undefined>(() => {
    if (!workspace) return undefined;
    const models = workspace.models;
    const capture = async (data: string, signal?: AbortSignal) => {
      const blob = await (await fetch(data, { signal })).blob();
      if (!["image/jpeg", "image/png"].includes(blob.type)) throw new Error(t.captureUploadFailed);
      const file = new File([blob], blob.type === "image/jpeg" ? "canvas-capture.jpg" : "canvas-capture.png", { type: blob.type });
      const headers = { "Content-Type": "application/json" };
      const initialize = await fetch("/api/business/provider-assets/upload", { method: "POST", headers, body: JSON.stringify({ action: "initialize", clientRequestId: crypto.randomUUID(), name: file.name, contentType: file.type, size: file.size }), signal });
      const init = await initialize.json();
      if (!initialize.ok || !init.upload?.id || !init.pathname) throw new Error(t.captureUploadFailed);
      await upload(init.pathname, file, { access: "private", handleUploadUrl: "/api/business/provider-assets/upload", contentType: file.type, clientPayload: JSON.stringify({ uploadId: init.upload.id }), abortSignal: signal });
      const complete = await fetch("/api/business/provider-assets/upload", { method: "POST", headers, body: JSON.stringify({ action: "complete", uploadId: init.upload.id }), signal });
      if (!complete.ok) throw new Error(t.captureUploadFailed);
      return { uploadId: init.upload.id, src: `/api/business/provider-assets/uploads/${init.upload.id}/preview` };
    };
    return {
      kind: "business", apiBasePath: "/api/business/workflows", backHref: "/business?tab=workflows", backLabel: t.back, billingNotice: t.billing, initialView: "canvas", showDirector: false,
      allowedNodeTypes: ["text", "loadImage", "image", "video", "director3d"], videoModels: models.filter(model => model.modality === "video").map(model => ({ id: model.id, name: model.displayName })),
      defaultNodeData: type => {
        if (type === "loadImage") return { items: [], businessItems: [] };
        if (type === "text" || type === "director3d") return defaultNodeData(type);
        const model = models.find(item => item.modality === type && !item.nsfw && (type !== "video" || !!item.seedance)) ?? models.find(item => item.modality === type && !item.nsfw);
        return type === "image" ? { prompt: "", model: model?.id ?? "", size: model?.sizes?.[0] ?? "" } : { prompt: "", model: model?.id ?? "", seconds: model?.defaultSeconds ?? model?.secondsOptions?.find(value => value > 0) ?? 5, resolution: model?.resolutions?.[0] ?? "", aspect_ratio: model?.aspectRatios?.includes("16:9") ? "16:9" : model?.aspectRatios?.[0] ?? "16:9", generate_audio: !!model?.nativeAudioOnly, mode: "freestyle" };
      },
      renderNodeSettings: (node, onChange) => ["loadImage", "image", "video"].includes(node.type) ? <NodeFields node={node} models={models} onChange={onChange} /> : undefined,
      runNode: createBusinessCanvasRunner({ models, copy: t, capture, onJob: rememberJob }),
      confirmRun: (graph, order) => {
        assertBusinessCanvasPreflight(graph, order, models, t);
        const paid = order.map(id => graph.nodes.find(node => node.id === id)!).filter(node => node.type === "image" || node.type === "video");
        if (paid.length && !workspace.access.keyConfigured) { window.alert(t.keyRequired); return false; }
        if (paid.some(node => !models.some(model => model.id === node.data.model && model.modality === node.type))) { window.alert(t.unavailableModel); return false; }
        return !paid.length || window.confirm(workflowText(t.confirm, { n: order.length, paid: paid.length, models: paid.map(node => `${models.find(model => model.id === node.data.model)?.displayName} · ${node.type === "video" ? `${node.data.seconds}s · ${node.data.resolution}` : node.data.size}`).join("\n") }));
      },
    };
  }, [workspace, t, rememberJob]);
  if (!workspace || workspace.workflow.id !== id || !runtime) return <section className={styles.status}><p role={error ? "alert" : "status"}>{error || t.loading}</p>{error && <button className={styles.button} onClick={() => void load()}>{t.retry}</button>}<Link href="/business?tab=workflows">{t.goStudio}</Link></section>;
  return <div className={styles.editor}>
    <CanvasEditor key={workspace.workflow.id} workflowId={id} initialName={workspace.workflow.name} initialGraph={workspace.workflow.graph} initialVersion={workspace.workflow.version} runtime={runtime} />
    <aside className={styles.ledger} aria-label={t.nodeRun}><details><summary>{t.nodeRun}{jobs.length ? ` · ${jobs.length}` : ""}</summary><p>{t.draftOnly}</p><nav><Link href="/business?tab=history">{t.history} ↗</Link><Link href="/business?tab=usage">{t.costs} ↗</Link></nav>{jobs.map(job => <div className={styles.receipt} key={job.id}><p>{job.model} · {job.id}</p><BusinessGenerationReceipt job={job} onUpdated={rememberJob} /></div>)}</details></aside>
  </div>;
}
