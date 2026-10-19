"use client";

import Image from "next/image";
import type { BusinessCopy } from "@/lib/i18n/business";
import type { businessStudioCopy } from "@/lib/i18n/businessStudio";
import type { BusinessGeneration, BusinessKind, BusinessModel } from "./types";
import { modelLabel } from "@/lib/modelLabel";
import styles from "./BusinessStudio.module.css";

export default function BusinessStage({ copy, business, kind, model, job, onHistory, onRefresh, refreshing }: {
  copy: ReturnType<typeof businessStudioCopy>; business: BusinessCopy; kind: BusinessKind;
  model?: BusinessModel; job?: BusinessGeneration; onHistory: () => void; onRefresh: () => void; refreshing: boolean;
}) {
  const pending = job && ["processing", "submitting", "unknown"].includes(job.status);
  const hasOutput = !!(job?.videoUrl || job?.images?.length || job?.text);
  return <section className={styles.stage} aria-label={copy.previewTitle}>
    <div className={styles.stageHeader}><span>{hasOutput ? copy.latestWork : copy.previewTitle}</span><span>{hasOutput ? modelLabel(job?.model ?? "") : model?.displayName ?? business[kind]}</span></div>
    {hasOutput ? <div className={styles.stageMedia}>
      {job?.videoUrl ? <video key={job.id} src={job.videoUrl} controls preload="metadata" playsInline aria-label={job.model} /> : job?.images?.length ? <div className={styles.gallery}>{job.images.map((image, index) => <a className={styles.galleryItem} key={image.url} href={image.url} target="_blank" rel="noreferrer" aria-label={`${business.view} ${index + 1}`}><Image src={image.url} alt={`${job.model} · ${index + 1}`} width={960} height={960} unoptimized /></a>)}</div> : <div className={styles.stageText}>{job?.text}</div>}
    </div> : <div className={styles.stageEmpty}>
      <svg className={styles.stageArt} viewBox="0 0 520 300" fill="none" aria-hidden="true">
        <path d="M44 221C139 238 127 97 269 77c83-12 150 10 204-38-36 106-121 178-261 196-56 8-111 2-168-14Z" stroke="currentColor" />
        <path d="M44 221C175 215 201 124 473 39M103 218l57-86m0 75 62-111m4 91 67-112m-7 91 83-99m-23 68 80-83M44 253h430M260 32v232" stroke="currentColor" opacity=".35" />
        <circle cx="260" cy="151" r="100" stroke="currentColor" opacity=".22" /><circle cx="260" cy="151" r="140" stroke="currentColor" opacity=".12" />
      </svg>
      <p className={styles.stageCaption}>{copy.studioLabel}</p>
      <h2>{pending ? business[job.status] : copy.previewEmpty}</h2>
      <p>{pending ? business.manualRefresh : copy.previewEmptyText}</p>
    </div>}
    <div className={styles.stageActions}>
      <p>{job ? <><span>{job.model}</span><br />{business[job.status]}</> : <>{business.providerBilling}<br />{business.noCredits}</>}</p>
      <button type="button" onClick={pending ? onRefresh : onHistory} disabled={refreshing}>{refreshing ? business.checking : pending ? business.checkOriginal : copy.viewHistory} <span aria-hidden="true">↗</span></button>
    </div>
  </section>;
}
