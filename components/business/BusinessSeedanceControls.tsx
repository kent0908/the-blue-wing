"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import type { BusinessSeedanceCapability, BusinessSeedanceMode, SeedanceReferenceType } from "@/lib/businessSeedance";
import { useLocale } from "@/lib/i18n/client";
import { businessSeedanceCopy, type BusinessSeedanceCopy } from "@/lib/i18n/businessSeedance";
import type { BusinessAsset, BusinessProviderAsset } from "./types";
import styles from "./BusinessSeedance.module.css";

interface Props {
  capability: BusinessSeedanceCapability;
  mode: BusinessSeedanceMode;
  onMode: (mode: BusinessSeedanceMode) => void;
  assets: BusinessAsset[];
  assetIds: number[];
  onLocalSelection: (id: number) => void;
  providerAssets: BusinessProviderAsset[];
  onProviderSelection: (asset: BusinessProviderAsset) => void;
  referenceOrder: string[];
  outputFormat: "mp4" | "mov";
  onOutputFormat: (value: "mp4" | "mov") => void;
  seed?: string;
  onSeed?: (value: string) => void;
}
const modeKeys: Record<BusinessSeedanceMode, readonly [keyof BusinessSeedanceCopy, keyof BusinessSeedanceCopy]> = {
  freestyle: ["freestyle", "freestyleInfo"], "text-to-video": ["textToVideo", "textToVideoInfo"],
  "image-to-video": ["imageToVideo", "imageToVideoInfo"], "first-last-frame": ["firstLastFrame", "firstLastFrameInfo"],
  "subject-reference": ["subjectReference", "subjectReferenceInfo"], "video-edit": ["videoEdit", "videoEditInfo"], "video-extend": ["videoExtend", "videoExtendInfo"],
};
const interpolate = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
function MediaIcon({ type }: { type: SeedanceReferenceType }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
    {type === "image" ? <><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="8" cy="9" r="1.5" /><path d="m4 18 5-5 4 3 3-5 4 7" /></> : type === "video" ? <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m10 9 5 3-5 3Z" /></> : <><path d="M9 17V6l10-2v11M9 10l10-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="16" cy="16" rx="3" ry="2" /></>}
  </svg>;
}

export default function BusinessSeedanceControls(props: Props) {
  const { capability, mode, onMode, assets, assetIds, onLocalSelection, providerAssets, onProviderSelection, referenceOrder, outputFormat, onOutputFormat, seed, onSeed } = props;
  const t = businessSeedanceCopy(useLocale());
  const id = useId();
  const [source, setSource] = useState<"local" | "provider">("local");
  const [catalog, setCatalog] = useState<BusinessProviderAsset[]>([]);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [errorCode, setErrorCode] = useState("");
  const committedQuery = useRef("");
  const pending = useRef<AbortController | null>(null);
  const localTab = useRef<HTMLButtonElement | null>(null);
  const providerTab = useRef<HTMLButtonElement | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

  const counts = { image: assetIds.length, video: 0, audio: 0 };
  providerAssets.forEach(asset => { counts[asset.type]++; });
  const selectedCount = assetIds.length + providerAssets.length;
  const frameMode = mode === "image-to-video" || mode === "first-last-frame";
  const referenceLimit = mode === "text-to-video" ? 0 : mode === "image-to-video" ? 1 : mode === "first-last-frame" ? 2 : capability.references.total;
  const blocked = (type: SeedanceReferenceType) => mode === "text-to-video" || selectedCount >= referenceLimit || counts[type] >= capability.references[type] || (frameMode && type !== "image");
  const blockedReason = (type: SeedanceReferenceType) => mode === "text-to-video" ? t.textReferences : frameMode && type !== "image" ? t.imageOnly : t.capReached;
  const chips = [
    ...assetIds.map(assetId => ({ key: `local:${assetId}`, type: "image" as const, name: assets.find(asset => asset.id === assetId)?.name || interpolate(t.assetUnnamed, { id: assetId }), remove: () => onLocalSelection(assetId), source: t.localAsset })),
    ...providerAssets.map(asset => ({ key: `provider:${asset.id}`, type: asset.type, name: asset.name, remove: () => onProviderSelection(asset), source: t.providerAsset })),
  ].sort((a, b) => {
    const ai = referenceOrder.indexOf(a.key), bi = referenceOrder.indexOf(b.key);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  const localImages = assets.filter(asset => !asset.contentType || ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(asset.contentType));
  const audioOnlyReferences = !counts.video && !counts.image && counts.audio > 0;

  async function loadProvider(nextPage = 1, search = query) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setErrorCode("");
    if (nextPage === 1) { setCatalog([]); setLoaded(false); committedQuery.current = search.trim(); }
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "50", status: "active" });
    if (committedQuery.current) params.set("name", committedQuery.current);
    try {
      const response = await fetch(`/api/business/provider-assets?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || body?.needsKey) { setErrorCode(body?.needsKey ? "credential_required" : body?.error?.code || "business_asset_unavailable"); return; }
      if (!Array.isArray(body?.assets) || !body.pagination || !Number.isSafeInteger(body.pagination.totalPages) || !Number.isSafeInteger(body.pagination.total)) throw new Error("invalid_asset_list");
      const items: BusinessProviderAsset[] = body.assets.filter((asset: BusinessProviderAsset) => asset && typeof asset.id === "string" && typeof asset.name === "string" && ["image", "video", "audio"].includes(asset.type) && asset.status === "active");
      setCatalog(previous => Array.from(new Map((nextPage === 1 ? items : [...previous, ...items]).map(asset => [asset.id, asset])).values()));
      setPage(nextPage); setTotal(body.pagination.total); setTotalPages(body.pagination.totalPages); setLoaded(true);
    } catch {
      if (!controller.signal.aborted) setErrorCode("business_asset_unavailable");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  const assetError = /credential/.test(errorCode) ? t.keyNeeded : /not_approved|suspended|access_denied/.test(errorCode) ? t.accessDenied : t.assetServiceUnavailable;

  return <section className={styles.controls} aria-label={`Seedance ${capability.version}`}>
    <fieldset className={styles.modes}>
      <legend>{t.mode}</legend>
      <div className={styles.modeGrid}>{capability.modes.map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { if (mode !== value) onMode(value); }} className={styles.modeButton}>{t[modeKeys[value][0]]}</button>)}</div>
      <p className={styles.modeInfo}>{t[modeKeys[mode][1]]}</p>
      <p className={styles.quiet}>{t.modeChangeNotice}</p>
    </fieldset>

    <div className={styles.referenceHeader}>
      <div><span className={styles.eyebrow}>{t.references}</span><p className={styles.total}><strong>{selectedCount}</strong><span>/ {referenceLimit}</span></p></div>
      <dl className={styles.counts}>{(["image", "video", "audio"] as const).map(type => <div key={type}><dt><MediaIcon type={type} />{t[type]}</dt><dd>{counts[type]}<span>/ {capability.references[type]}</span></dd></div>)}</dl>
    </div>
    <p className={styles.quiet}>{interpolate(t.referenceLimit, capability.references)}</p>
    {capability.version === "2.0" && <p className={audioOnlyReferences ? styles.notice : styles.quiet}>{t.audioOnlyNotice}</p>}
    {mode === "text-to-video" && <p className={styles.notice}>{t.textReferences}</p>}

    {!!chips.length && <div className={styles.selection} aria-label={t.selected}>
      <p className={styles.quiet}>{t.selectionOrder}</p>
      <ol className={styles.chips}>{chips.map((chip, index) => <li key={chip.key}>
        <span className={styles.chipNumber}>{frameMode ? index ? t.lastFrame : t.firstFrame : String(index + 1).padStart(2, "0")}</span>
        <span className={styles.chipIcon}><MediaIcon type={chip.type} /></span>
        <span className={styles.chipName} title={chip.name}>{chip.name}<small>{chip.source}</small></span>
        <button type="button" aria-label={`${t.remove} ${chip.name}`} onClick={chip.remove}>×</button>
      </li>)}</ol>
    </div>}

    <details className={styles.picker}>
      <summary><span>{t.references}</span><span>{selectedCount} / {referenceLimit}<span aria-hidden="true"> ＋</span></span></summary>
      <div className={styles.pickerBody}>
        <div className={styles.tabs} role="tablist" aria-label={t.references} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "local" : event.key === "End" ? "provider" : source === "local" ? "provider" : "local";
          setSource(next); (next === "local" ? localTab : providerTab).current?.focus();
        }}>
          <button ref={localTab} type="button" role="tab" tabIndex={source === "local" ? 0 : -1} id={`${id}-local-tab`} aria-controls={`${id}-local`} aria-selected={source === "local"} onClick={() => setSource("local")}>{t.ownLibrary}</button>
          <button ref={providerTab} type="button" role="tab" tabIndex={source === "provider" ? 0 : -1} id={`${id}-provider-tab`} aria-controls={`${id}-provider`} aria-selected={source === "provider"} onClick={() => { setSource("provider"); }}>{t.providerLibrary}</button>
        </div>
        {source === "local" ? <div role="tabpanel" id={`${id}-local`} aria-labelledby={`${id}-local-tab`}>
          <p className={styles.quiet}>{t.libraryDescription}</p>
          {localImages.length ? <div className={styles.localGrid}>{localImages.map(asset => {
            const chosen = assetIds.includes(asset.id), disabled = !chosen && blocked("image");
            return <button type="button" className={styles.localAsset} key={asset.id} aria-pressed={chosen} disabled={disabled} title={disabled ? blockedReason("image") : asset.name} onClick={() => onLocalSelection(asset.id)}>
              <Image src={asset.src.startsWith("/api/") ? asset.src : `/api/assets/${asset.id}/raw`} alt="" width={120} height={80} unoptimized />
              <span>{asset.name}</span><small>{chosen ? t.selected : t.select}</small>
            </button>;
          })}</div> : <p className={styles.empty}>{t.noLocalAssets}</p>}
          <a className={styles.link} href="/assets" target="_blank" rel="noopener noreferrer">{t.openLibrary} ↗</a>
        </div> : <div role="tabpanel" id={`${id}-provider`} aria-labelledby={`${id}-provider-tab`}>
          <p className={styles.quiet}>{t.providerDescription}</p>
          <div className={styles.searchRow}>
            <input aria-label={t.search} placeholder={t.search} value={query} maxLength={120} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void loadProvider(); } }} />
            <button type="button" className={styles.smallButton} disabled={loading} onClick={() => { void loadProvider(); }}>{t.searchButton}</button>
          </div>
          <button type="button" className={styles.loadButton} disabled={loading} onClick={() => { void loadProvider(); }}>{loading ? t.loading : loaded ? t.reload : t.loadAssets}</button>
          {errorCode && <p className={styles.error} role="alert">{assetError}</p>}
          {loaded && !catalog.length && <p className={styles.empty}>{t.noProviderAssets}</p>}
          {!!catalog.length && <div className={styles.providerList}>{catalog.map(asset => {
            const chosen = providerAssets.some(selected => selected.id === asset.id), disabled = !chosen && (asset.status !== "active" || blocked(asset.type));
            return <button type="button" className={styles.providerAsset} key={asset.id} aria-pressed={chosen} disabled={disabled} title={disabled ? blockedReason(asset.type) : asset.name} onClick={() => onProviderSelection(asset)}>
              <span className={styles.providerIcon}><MediaIcon type={asset.type} /></span><span className={styles.providerName}>{asset.name}<small>{t[asset.type]} · {t.active}</small></span><span className={styles.selectionMark} aria-hidden="true">{chosen ? "✓" : "+"}</span>
            </button>;
          })}</div>}
          {loaded && <p className={styles.quiet} role="status">{interpolate(t.resultCount, { count: catalog.length, total })}</p>}
          {loaded && page < totalPages && <button type="button" disabled={loading} className={styles.loadButton} onClick={() => { void loadProvider(page + 1, committedQuery.current); }}>{loading ? t.loading : t.more}</button>}
          <p className={styles.quiet}>{t.providerAccessNotice}</p>
          <a className={styles.link} href="https://console.siraya.ai/assets" target="_blank" rel="noopener noreferrer">{t.openProvider} ↗</a>
        </div>}
        <p className={styles.readOnly}>{t.readOnly}</p>
      </div>
    </details>
    <details className={styles.guide}>
      <summary>{t.referenceGuide}</summary>
      <p>{t.localRequirements}</p><p>{t.providerMediaRequirements}</p><p>{t.faceNotice}</p>
      <div className={styles.guideLinks}><a className={styles.link} href="https://docs.siraya.ai/docs/api-reference/generative-model-api/Seedance/" target="_blank" rel="noopener noreferrer">{t.providerDocs} ↗</a><a className={styles.link} href="https://docs.siraya.ai/docs/api-reference/asset-management-api/seedance-2.0-integration/" target="_blank" rel="noopener noreferrer">{t.assetDocs} ↗</a></div>
    </details>

    {(capability.outputFormats.length > 0 || onSeed) && <div className={styles.outputSettings}>
      {capability.outputFormats.length > 0 && <label className={styles.field}>{t.format}<select value={outputFormat} onChange={event => onOutputFormat(event.target.value as "mp4" | "mov")}>{capability.outputFormats.map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select></label>}
      {onSeed && <label className={styles.field}>{t.seed}<input type="number" min={-1} max={2147483647} step={1} value={seed ?? ""} placeholder={t.seedPlaceholder} onChange={event => onSeed(event.target.value)} /></label>}
    </div>}
    {outputFormat === "mov" && capability.outputFormats.includes("mov") && <p className={styles.notice}>{t.movNotice}</p>}
    {onSeed && <p className={styles.quiet}>{t.seedNotice}</p>}
  </section>;
}
