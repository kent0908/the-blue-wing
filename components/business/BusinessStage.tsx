"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { BusinessCopy } from "@/lib/i18n/business";
import { businessError } from "@/lib/i18n/business";
import type { businessStudioCopy } from "@/lib/i18n/businessStudio";
import { businessResultsCopy } from "@/lib/i18n/businessResults";
import type { BusinessGeneration, BusinessKind, BusinessModel } from "./types";
import { modelLabel } from "@/lib/modelLabel";
import BusinessGenerationReceipt from "./BusinessGenerationReceipt";
import { useLocale } from "@/lib/i18n/client";
import styles from "./BusinessResults.module.css";

export function ResultDialog({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className={styles.viewer} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={styles.viewerHead}><h2 id={titleId}>{title}</h2><button type="button" className={styles.button} onClick={onClose} autoFocus>{closeLabel} ×</button></div>{children}
  </dialog>;
}

export function ResultCard({ job, business, onClick, selected, compact = false }: { job: BusinessGeneration; business: BusinessCopy; onClick: () => void; selected?: boolean; compact?: boolean }) {
  const locale = useLocale();
  const c = businessResultsCopy(locale);
  const label = modelLabel(job.model);
  return <button type="button" className={styles.card} onClick={onClick} aria-pressed={selected} aria-label={`${c.result} · ${label} · ${business[job.status]} · ${job.prompt}`}>
    <div className={styles.cardMedia}>
      {job.images?.[0] ? <Image src={job.images[0].url} alt="" width={400} height={300} unoptimized loading="lazy" /> : job.videoUrl ? <video src={job.videoUrl} preload="metadata" muted playsInline aria-hidden="true" /> : job.text ? <div className={styles.cardText}>{job.text.slice(0, 400)}</div> : <span aria-hidden="true">{job.status === "failed" ? "!" : "◌"}</span>}
      {job.kind === "video" ? <small className={styles.countBadge}>▶ {business.video}</small> : (job.images?.length ?? 0) > 1 ? <small className={styles.countBadge}>{job.images!.length}</small> : null}
    </div>
    <div className={styles.cardInfo}><strong>{label}</strong><span className={styles.badge} data-status={job.status}>{business[job.status]}</span>{job.nsfw && <span className={styles.badge}>{business.nsfw}</span>}{!compact && <><p>{job.prompt}</p><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString(locale)}</time></>}</div>
  </button>;
}

export default function BusinessStage({ copy, business, kind, model, job, onHistory, onRefresh, refreshing, movNotice, onJobUpdated, onReuse, recentJobs = [], onSelect, inDialog = false }: {
  copy: ReturnType<typeof businessStudioCopy>; business: BusinessCopy; kind: BusinessKind;
  model?: BusinessModel; job?: BusinessGeneration; onHistory: () => void; onRefresh: () => void; refreshing: boolean;
  movNotice?: string; onJobUpdated?: (job: BusinessGeneration) => void; onReuse?: (job: BusinessGeneration) => void;
  recentJobs?: BusinessGeneration[]; onSelect?: (job: BusinessGeneration) => void; inDialog?: boolean;
}) {
  const locale = useLocale();
  const c = businessResultsCopy(locale);
  const [imageIndex, setImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const pending = job && ["processing", "submitting", "unknown"].includes(job.status);
  const hasOutput = !!(job?.videoUrl || job?.images?.length || job?.text);
  const image = job?.images?.[imageIndex] ?? job?.images?.[0];
  const url = job?.videoUrl ?? image?.url;
  const downloadUrl = url?.startsWith("/api/business/media/") ? `${url}${url.includes("?") ? "&" : "?"}download=1` : url;
  const title = job ? modelLabel(job.model) : model?.displayName ?? business[kind];
  const open = () => { video.current?.pause(); setExpanded(true); };
  const copyPrompt = async () => { try { await navigator.clipboard.writeText(job?.prompt ?? ""); setFeedback(c.copied); } catch { setFeedback(c.copyFailed); } };
  const media = (large = false) => <div className={styles.media}>
    {job?.videoUrl ? <video ref={large ? undefined : video} src={job.videoUrl} controls preload="metadata" playsInline aria-label={title} /> : image ? large || inDialog ? <Image src={image.url} alt={`${title} · ${imageIndex + 1}`} width={1600} height={1600} unoptimized /> : <button type="button" className={styles.imageButton} onClick={open} aria-label={c.expand}><Image src={image.url} alt={`${title} · ${imageIndex + 1}`} width={1200} height={1200} unoptimized /></button> : <div className={styles.text}>{job?.text}</div>}
  </div>;
  const thumbnails = job?.images && job.images.length > 1 ? <><div className={styles.thumbs} aria-label={c.results}>{job.images.map((item, index) => <button className={styles.thumb} type="button" key={`${item.url}-${index}`} aria-label={`${c.result} ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}><Image src={item.url} alt="" width={100} height={100} unoptimized loading="lazy" /></button>)}</div><div className={styles.counter}>{imageIndex + 1} / {job.images.length}</div></> : null;
  return <section className={styles.stage} aria-label={c.results}>
    <header className={styles.header}><h2>{c.results}</h2><span>{title}</span></header>
    {hasOutput ? media() : <div className={styles.empty} role={pending ? "status" : undefined}>
      {pending && <span className={styles.spinner} aria-hidden="true" />}
      <h3>{job ? business[job.status] : copy.previewEmpty}</h3>
      <p>{job?.status === "failed" ? businessError(business, job.errorCode ?? "generation_failed") : job?.status === "unknown" || job?.status === "submitting" ? c.unknown : pending ? c.pending : job ? c.emptyOutput : copy.previewEmptyText}</p>
    </div>}
    {thumbnails}
    {job && <div className={styles.info}><span className={styles.badge} data-status={job.status}>{business[job.status]}</span>{job.nsfw && <span className={styles.badge}>{business.nsfw}</span>}<time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString(locale)}</time></div>}
    {(job || url) && <div className={styles.actions}>
      {job && onReuse && <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => onReuse(job)}>{c.reuse} ↗</button>}
      {hasOutput && !inDialog && <button type="button" className={styles.button} onClick={open}>{c.expand}</button>}
      {url && <a href={downloadUrl} download target="_blank" rel="noreferrer">{business.download} ↓</a>}
      {job && <button type="button" className={styles.button} onClick={copyPrompt}>{c.copy}</button>}
      {(pending || job && !hasOutput) && <button type="button" className={styles.button} onClick={onRefresh} disabled={refreshing}>{refreshing ? business.checking : business.checkOriginal}</button>}
    </div>}
    {feedback && <p className={styles.notice} role="status">{feedback}</p>}
    {job?.videoUrl && /\.mov(?:\?|$)/i.test(job.videoUrl) && movNotice && <p className={styles.notice}>{movNotice}</p>}
    {job && <details className={styles.details}><summary>{c.details}</summary><p>{job.prompt}</p>{job.errorCode && <p className={styles.error}>{businessError(business, job.errorCode)}</p>}<BusinessGenerationReceipt job={job} onUpdated={onJobUpdated} /><p>{business.requestId}: {job.id}</p></details>}
    {!inDialog && recentJobs.length > 0 && <div className={styles.recent}><div className={styles.recentHeader}><h3>{c.recent}</h3><button type="button" className={styles.button} onClick={onHistory}>{copy.viewHistory} ↗</button></div>{onSelect && <div className={styles.rail}>{recentJobs.slice(0, 12).map(item => <ResultCard key={item.id} job={item} business={business} onClick={() => onSelect(item)} selected={item.id === job?.id} compact />)}</div>}</div>}
    {expanded && <ResultDialog title={title} closeLabel={c.close} onClose={() => setExpanded(false)}>{media(true)}{thumbnails}<div className={styles.actions}>{job?.images && job.images.length > 1 && <><button className={styles.button} type="button" disabled={imageIndex === 0} onClick={() => setImageIndex(index => index - 1)}>{c.previous}</button><button className={styles.button} type="button" disabled={imageIndex >= job.images.length - 1} onClick={() => setImageIndex(index => index + 1)}>{c.next}</button></>}{url && <a href={downloadUrl} target="_blank" rel="noreferrer" download>{business.download} ↓</a>}</div></ResultDialog>}
  </section>;
}
