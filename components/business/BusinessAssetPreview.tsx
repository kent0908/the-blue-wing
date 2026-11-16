"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { BusinessAssetsCopy } from "@/lib/i18n/businessAssets";
import BusinessDialog from "./BusinessDialog";
import type { BusinessAssetRecord } from "./BusinessAssets";
import styles from "./BusinessAssets.module.css";

function AssetIcon({ type }: { type: BusinessAssetRecord["type"] }) {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2">
    {type === "image" ? <><rect x="7" y="9" width="34" height="30" rx="1"/><circle cx="17" cy="18" r="3"/><path d="m9 35 10-11 7 6 6-10 7 15"/></>
      : type === "video" ? <><rect x="7" y="11" width="34" height="26" rx="1"/><path d="m20 18 11 6-11 6Z"/></>
      : <><path d="M18 34V13l19-4v22M18 20l19-4"/><ellipse cx="12" cy="35" rx="6" ry="4"/><ellipse cx="31" cy="32" rx="6" ry="4"/></>}
  </svg>;
}

function previewSources(asset: BusinessAssetRecord): string[] {
  if (asset.type === "audio") return [];
  const base = "/api/business/provider-assets";
  const sources: string[] = [];
  if (asset.uploadId && asset.storageReady) sources.push(`${base}/uploads/${encodeURIComponent(asset.uploadId)}/preview`);
  if (asset.providerReady) sources.push(`${base}/${encodeURIComponent(asset.id)}/preview`);
  return sources;
}

/** Capture just the first decoded frame, then release the card's video element. */
function firstFrame(event: SyntheticEvent<HTMLVideoElement>): string | null {
  const video = event.currentTarget;
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  }
}

export default function BusinessAssetPreview({ asset, copy, compact = false }: { asset: BusinessAssetRecord; copy: BusinessAssetsCopy; compact?: boolean }) {
  const sources = previewSources(asset);
  return <AssetPreview key={sources.join("|")} asset={asset} sources={sources} copy={copy} compact={compact}/>;
}

function AssetPreview({ asset, sources, copy, compact }: { asset: BusinessAssetRecord; sources: string[]; copy: BusinessAssetsCopy; compact: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [poster, setPoster] = useState<string | null>(null);
  const [viewerSource, setViewerSource] = useState<number | null>(null);
  const src = sources[sourceIndex];
  const viewerSrc = viewerSource === null ? undefined : sources[viewerSource];
  const video = asset.type === "video";

  useEffect(() => {
    const target = card.current;
    if (!target || (!video && !compact) || !sources.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [sources.length, video, compact]);

  const nextSource = () => setSourceIndex(index => Math.min(index + 1, sources.length));
  const nextViewerSource = () => setViewerSource(index => index === null ? null : index + 1);
  const previewLabel = (video ? copy.playPreview : copy.viewImage).replace("{name}", asset.name);
  return <div ref={card} className={compact ? `${styles.thumbnail} ${styles.inlineThumbnail}` : styles.thumbnail}>
    <AssetIcon type={asset.type}/>
    {src && !video && (!compact || near) && <Image key={src} src={src} alt="" width={640} height={420} loading="lazy" unoptimized onError={nextSource}/>}
    {video && near && src && !poster && <video
      key={src} className={styles.videoDecoder} src={src} preload="auto" muted playsInline aria-hidden="true"
      onLoadedData={event => { const frame = firstFrame(event); if (frame) setPoster(frame); else nextSource(); }}
      onError={nextSource}
    />}
    {poster && <Image src={poster} alt="" width={480} height={300} unoptimized/>}
    {!compact && <span className={styles.mediaType}>{copy[asset.type]}</span>}
    {(video || compact) && sources.length > 0 && <button
      type="button" className={styles.playPreview} aria-label={previewLabel} title={previewLabel}
      onClick={() => setViewerSource(src ? sourceIndex : 0)}
    >
      {video ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4.5v15l12-7.5z"/></svg>
        : <svg className={styles.expandPreviewIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 4h6v6M20 4l-6 6M10 20H4v-6m0 6 6-6"/></svg>}
    </button>}
    {!compact && sources.length > 0 && !src && !video && <span className={styles.previewUnavailable}>{copy.previewUnavailable}</span>}
    {viewerSource !== null && <BusinessDialog title={asset.name} className={styles.previewDialog} onClose={() => setViewerSource(null)}>
      {!viewerSrc ? <p role="alert">{copy.previewUnavailable}</p> : video ? <video
        key={viewerSrc} className={styles.previewPlayer} src={viewerSrc}
        poster={poster ?? undefined} controls autoPlay playsInline preload="metadata" aria-label={previewLabel}
        onError={nextViewerSource}
      /> : <Image key={viewerSrc} className={styles.previewImage} src={viewerSrc} alt={asset.name}
        width={920} height={640} unoptimized onError={nextViewerSource}/>}
      <button type="button" className={styles.small} onClick={() => setViewerSource(null)}>{copy.closePreview}</button>
    </BusinessDialog>}
  </div>;
}
