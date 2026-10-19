"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale } from "@/lib/i18n/client";
import { businessCopy, businessError } from "@/lib/i18n/business";
import { klingCopy } from "@/lib/i18n/kling";
import type { BusinessAccess, BusinessCredential, BusinessGeneration, BusinessKind, BusinessModel, BusinessSubmission, BusinessAsset } from "./types";
import BusinessAdultDeclaration from "./BusinessAdultDeclaration";
import BusinessDialog from "./BusinessDialog";
import styles from "./Business.module.css";

const REQUEST_HEADERS = { "Content-Type": "application/json" };
// The API guarantees these failures occurred before a paid provider request.
const PRE_SUBMIT_ERRORS = new Set(["invalid_origin", "invalid_body", "invalid_parameters", "invalid_reference", "model_unavailable", "age_unverified", "credential_required", "credential_changed", "prompt_blocked", "too_many_concurrent", "business_not_approved", "business_suspended", "encryption_unavailable", "credential_unavailable"]);
const isPending = (job: BusinessGeneration) => ["submitting", "processing", "unknown"].includes(job.status);

export default function BusinessWorkspace() {
  const locale = useLocale();
  const t = businessCopy(locale);
  const klingText = klingCopy(locale);
  const [access, setAccess] = useState<BusinessAccess | null>(null);
  const [auth, setAuth] = useState<"loading" | "signedOut" | "unverified" | "signedIn">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState("");
  const [useCase, setUseCase] = useState("");
  const [applying, setApplying] = useState(false);
  const [tab, setTab] = useState<"create" | "key" | "history">("create");
  const [credential, setCredential] = useState<BusinessCredential | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [keyLabel, setKeyLabel] = useState("SIRAYA");
  const [keySaving, setKeySaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [models, setModels] = useState<BusinessModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [kind, setKind] = useState<BusinessKind>("image");
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("");
  const [resolution, setResolution] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [aspect, setAspect] = useState("16:9");
  const [audio, setAudio] = useState(false);
  const [assets, setAssets] = useState<BusinessAsset[]>([]);
  const [assetIds, setAssetIds] = useState<number[]>([]);
  const [jobs, setJobs] = useState<BusinessGeneration[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<BusinessSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitLock = useRef(false);
  const keyLock = useRef(false);
  const unresolvedRequest = useRef<string | null>(null);
  const selectedModels = models.filter(model => model.modality === kind);
  const selected = selectedModels.find(model => model.id === modelId) ?? selectedModels[0];
  const approved = access?.account?.status === "approved";

  const refreshAccess = useCallback(async () => {
    const response = await fetch("/api/business/access", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (response.status === 401) { setAuth("signedOut"); setAccess(null); return; }
    if (response.status === 403 && /email|verif/.test(data?.error?.code ?? "")) { setAuth("unverified"); setAccess(null); return; }
    if (!response.ok) throw new Error("access");
    setAuth("signedIn"); setAccess(data);
    if (data.account) { setCompany(data.account.companyName); setUseCase(data.account.useCase); }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => { try { await refreshAccess(); } catch { if (active) { setAuth("signedIn"); setError(t.unavailable); } } };
    void load();
    return () => { active = false; };
  }, [refreshAccess, t.unavailable]);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const response = await fetch("/api/business/models", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setModels([]); setError(businessError(t, data?.error?.code)); return; }
      setModels(data.models ?? []);
    } catch { setError(t.unavailable); }
    finally { setModelsLoading(false); }
  }, [t]);

  const loadHistory = useCallback(async (reconcile = true) => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/business/generations", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(businessError(t, data?.error?.code)); return; }
      let nextJobs: BusinessGeneration[] = data.generations ?? [];
      if (reconcile) {
        const updates = await Promise.allSettled(nextJobs.filter(isPending).slice(0, 12).map(async job => {
          const status = await fetch(`/api/business/generations/${encodeURIComponent(job.id)}`, { cache: "no-store" });
          if (!status.ok) return job;
          const result = await status.json();
          return (result.generation ?? job) as BusinessGeneration;
        }));
        const replaced = new Map(updates.filter((item): item is PromiseFulfilledResult<BusinessGeneration> => item.status === "fulfilled").map(item => [item.value.id, item.value]));
        nextJobs = nextJobs.map(job => replaced.get(job.id) ?? job);
      }
      setJobs(nextJobs);
      if (unresolvedRequest.current) {
        const original = nextJobs.find(job => job.clientRequestId === unresolvedRequest.current);
        if (original && original.status !== "unknown" && original.status !== "submitting") { unresolvedRequest.current = null; setUncertain(false); }
      }
    } catch { setError(t.unavailable); }
    finally { setHistoryLoading(false); }
  }, [t]);

  useEffect(() => {
    if (!approved) return;
    let active = true;
    const load = async () => {
      const results = await Promise.allSettled([
        fetch("/api/business/credentials", { cache: "no-store" }).then(async response => response.ok ? response.json() : null),
        fetch("/api/assets", { cache: "no-store" }).then(async response => response.ok ? response.json() : null),
      ]);
      if (!active) return;
      const key = results[0].status === "fulfilled" ? results[0].value?.credential : null;
      setCredential(key ?? null); if (key?.label) setKeyLabel(key.label);
      const library = results[1].status === "fulfilled" ? results[1].value?.assets : [];
      setAssets(Array.isArray(library) ? library : []);
    };
    void load();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the signed-in workspace's private history
    void loadHistory(false);
    if (access?.keyConfigured) void loadModels();
    return () => { active = false; };
  }, [approved, access?.keyConfigured, loadModels, loadHistory]);

  const refresh = async () => { if (loading) return; setLoading(true); setError(""); try { await refreshAccess(); setNotice(t.refreshed); } catch { setError(t.unavailable); } finally { setLoading(false); } };
  const apply = async (event: React.FormEvent) => {
    event.preventDefault(); if (applying) return;
    setApplying(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/business/access", { method: "POST", headers: REQUEST_HEADERS, body: JSON.stringify({ companyName: company.trim(), useCase: useCase.trim() }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(businessError(t, data?.error?.code)); return; }
      await refreshAccess(); setNotice(t.pendingText);
    } catch { setError(t.unavailable); }
    finally { setApplying(false); }
  };
  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault(); if (keyLock.current) return;
    if (!/^sk-[A-Za-z0-9_-]{16,200}$/.test(apiKey.trim())) { setError(t.keyFormat); return; }
    keyLock.current = true; setKeySaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/business/credentials", { method: "PUT", headers: REQUEST_HEADERS, body: JSON.stringify({ apiKey: apiKey.trim(), label: keyLabel.trim() || "SIRAYA" }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(businessError(t, data?.error?.code)); return; }
      setCredential(data.credential ?? null); await refreshAccess(); setNotice(t.keySaved);
    } catch { setError(t.unavailable); }
    finally { setApiKey(""); keyLock.current = false; setKeySaving(false); }
  };
  const deleteKey = async () => {
    if (keyLock.current) return; keyLock.current = true; setKeySaving(true); setError("");
    try {
      const response = await fetch("/api/business/credentials", { method: "DELETE" });
      if (!response.ok) { setError(t.error); return; }
      setCredential(null); setModels([]); setApiKey(""); await refreshAccess(); setNotice(t.keyDeleted); setDeleteOpen(false);
    } catch { setError(t.unavailable); }
    finally { keyLock.current = false; setKeySaving(false); }
  };
  const chooseKind = (value: BusinessKind) => { setKind(value); setModelId(""); setSize(""); setResolution(""); setAssetIds([]); setAudio(false); };
  const chooseModel = (value: string) => { setModelId(value); setSize(""); setResolution(""); setAssetIds([]); setAudio(false); const model = models.find(item => item.id === value); setSeconds(model?.defaultSeconds ?? Math.min(model?.maxSeconds ?? 5, Math.max(model?.minSeconds ?? 2, 5))); };
  const requestConfirmation = (event: React.FormEvent) => {
    event.preventDefault(); if (submitLock.current || uncertain || !selected || !prompt.trim()) return;
    if (prompt.length > (selected.promptMaxChars ?? 12000)) { setError(klingText.promptLimit); return; }
    if (assetIds.length > Math.min(selected.maxReferenceImages ?? 4, /^minimax-h3(?:-max)?$/.test(selected.id) ? 9 : 4)) { setError(klingText.referenceLimit); return; }
    if (selected.nsfw && !access?.adultVerified) { setError(t.ageRequired); return; }
    if (/\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/.test(prompt)) { setError(t.keyWarning); return; }
    const parameters: BusinessSubmission["parameters"] = { model: selected.id, prompt: prompt.trim() };
    if (kind === "image") { parameters.n = 1; const outputSize = size || selected.sizes?.[0]; if (outputSize) parameters.size = outputSize; }
    if (kind === "video") { parameters.seconds = selected.secondsOptions?.length && !selected.secondsOptions.includes(seconds) ? selected.defaultSeconds ?? selected.secondsOptions[0] : Math.max(selected.minSeconds ?? 2, Math.min(seconds, selected.maxSeconds ?? 30)); parameters.resolution = resolution || selected.resolutions?.[0]; const outputAspect = selected.aspectRatios?.includes(aspect) ? aspect : selected.aspectRatios?.[0]; if (outputAspect) parameters.aspect_ratio = outputAspect; if (selected.supportsAudio) parameters.generate_audio = selected.nativeAudioOnly || (!selected.nativeAudioResolutions || selected.nativeAudioResolutions.includes(parameters.resolution ?? "")) && audio; }
    if (kind === "text") parameters.max_tokens = 1024;
    if (selected.supportsReferences && assetIds.length) parameters.assetIds = [...assetIds];
    setError(""); setConfirmation({ clientRequestId: crypto.randomUUID(), kind, parameters });
  };
  const submitGeneration = async () => {
    if (submitLock.current || !confirmation) return;
    const request = confirmation; submitLock.current = true; setSubmitting(true); setError(""); setNotice(""); unresolvedRequest.current = request.clientRequestId;
    try {
      const response = await fetch("/api/business/generations", { method: "POST", headers: REQUEST_HEADERS, body: JSON.stringify(request) });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (!PRE_SUBMIT_ERRORS.has(data?.error?.code) && (response.status >= 500 || response.status === 408 || data?.error?.code === "outcome_unknown")) { setUncertain(true); setError(t.uncertain); }
        else { unresolvedRequest.current = null; setError(businessError(t, data?.error?.code)); }
        return;
      }
      const job = data?.generation as BusinessGeneration | undefined;
      if (!job) { setUncertain(true); setError(t.uncertain); return; }
      setJobs(current => [job, ...current.filter(item => item.id !== job.id)]);
      if (job.status === "unknown" || job.status === "submitting") { setUncertain(true); setError(t.uncertain); }
      else { unresolvedRequest.current = null; setUncertain(false); setNotice(t.submittingNotice); }
      setTab("history");
    } catch { setUncertain(true); setError(t.uncertain); }
    finally { setConfirmation(null); submitLock.current = false; setSubmitting(false); }
  };
  const selectedSize = selected?.sizes?.includes(size) ? size : selected?.sizes?.[0] ?? "";
  const selectedResolution = selected?.resolutions?.includes(resolution) ? resolution : selected?.resolutions?.[0] ?? "";
  const selectedAspect = selected?.aspectRatios?.includes(aspect) ? aspect : selected?.aspectRatios?.[0] ?? "";
  const selectedSeconds = selected?.secondsOptions?.length && !selected.secondsOptions.includes(seconds) ? selected.defaultSeconds ?? selected.secondsOptions[0] : Math.max(selected?.minSeconds ?? 2, Math.min(seconds, selected?.maxSeconds ?? 30));
  const supportsAudioAtResolution = !selected?.nativeAudioResolutions || selected.nativeAudioResolutions.includes(selectedResolution);
  const referenceLimit = Math.min(selected?.maxReferenceImages ?? 4, /^minimax-h3(?:-max)?$/.test(selected?.id ?? "") ? 9 : 4);
  const dateLabel = (date: string) => { const parsed = new Date(date); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed); };

  return <div className={styles.page}><div className={styles.inner}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>{t.eyebrow}</p><h1>{t.title}</h1><p>{t.description}</p></div><div className={styles.heroArt} aria-hidden="true"><i className={styles.artLine} /><i className={styles.artLine} /><i className={styles.artLine} /><span className={styles.artCaption}>YOUR KEY.<br />YOUR NEXT CREATION.</span></div></header>
    <div className={styles.principles}>{[[t.independent, t.independentText], [t.ownKey, t.ownKeyText], [t.ownCosts, t.ownCostsText]].map(([title, text], index) => <section className={styles.principle} key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{text}</p></section>)}</div>
    {error ? <p role="alert" className={styles.feedback}>{error}</p> : null}{notice ? <p role="status" className={styles.success}>{notice}</p> : null}
    {auth === "loading" ? <p className={styles.description} role="status">{t.loading}</p> : auth === "signedOut" ? <section className={styles.panel}><h2 className={styles.heading}>{t.loginTitle}</h2><p className={styles.description}>{t.loginText}</p><div className={styles.row} style={{ marginTop: 24 }}><Link href="/login?next=%2Fbusiness" className={styles.button}>{t.login}</Link></div></section> : auth === "unverified" ? <p className={styles.warning}>{t.verifyEmail}</p> : !access ? <section className={styles.panel}><button className={styles.secondary} onClick={refresh} disabled={loading}>{t.refresh}</button></section> : !approved ? <section className={styles.panel}>
      <div className={styles.panelHead}><div><h2 className={styles.heading}>{t.applyTitle}</h2><p className={styles.description}>{t.applyText}</p></div><button type="button" className={styles.small} onClick={refresh} disabled={loading}>{loading ? t.checking : t.refresh}</button></div>
      {access.account ? <div className={styles.stateCard}><span className={styles.status}>{t[access.account.status]}</span><p>{access.account.status === "pending" ? t.pendingText : access.account.status === "rejected" ? t.rejectedText : t.suspendedText}</p>{access.account.reviewNote ? <p className={styles.review}><strong>{t.reviewNote}</strong><br />{access.account.reviewNote}</p> : null}</div> : null}
      {access.account?.status !== "suspended" ? <form className={styles.form} onSubmit={apply}><label className={styles.field}>{t.company}<input required minLength={1} maxLength={120} value={company} onChange={e => setCompany(e.target.value)} placeholder={t.companyPlaceholder} autoComplete="organization" /></label><label className={styles.field}>{t.useCase}<textarea required minLength={10} maxLength={2000} value={useCase} onChange={e => setUseCase(e.target.value)} placeholder={t.useCasePlaceholder} /></label><div><button type="submit" className={styles.button} disabled={applying}>{applying ? t.applying : access.account ? t.reapply : t.apply}</button></div></form> : null}
    </section> : <>
      <div className={styles.workspaceTop}><p>{access.account?.companyName}</p><span className={styles.status}>{t.approved}</span><button className={styles.small} onClick={refresh} disabled={loading}>{t.refresh}</button></div>
      <div role="tablist" aria-label={t.workspace} className={styles.tabs}>{(["create", "key", "history"] as const).map(value => <button key={value} id={`business-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls={`business-panel-${value}`} className={styles.tab} onClick={() => { setApiKey(""); setTab(value); setError(""); setNotice(""); }}>{value === "create" ? t.createTab : value === "key" ? t.keyTab : t.historyTab}</button>)}</div>
      <section id={`business-panel-${tab}`} role="tabpanel" aria-labelledby={`business-tab-${tab}`} className={styles.panel}>
        {tab === "key" ? <><div className={styles.panelHead}><div><h2 className={styles.heading}>{t.keyTitle}</h2><p className={styles.description}>{t.keyText}</p></div></div>{credential ? <div className={styles.keyCard}><div><strong>{credential.label}</strong><p>{t.configured} · {t.last4} •••• {credential.last4}</p><p>{dateLabel(credential.updatedAt)}</p></div><button className={styles.small} type="button" onClick={() => setDeleteOpen(true)} disabled={keySaving}>{t.deleteKey}</button></div> : <p className={styles.note}>{t.notConfigured}</p>}
          {!access.encryptionReady ? <p className={styles.warning}>{t.encryptionUnavailable}</p> : null}<form className={styles.form} onSubmit={saveKey} autoComplete="off"><label className={styles.field}>{t.keyLabel}<input value={keyLabel} onChange={e => setKeyLabel(e.target.value)} maxLength={64} required autoComplete="off" /></label><label className={styles.field}>{t.apiKey}<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} required placeholder={t.keyPlaceholder} maxLength={203} autoComplete="new-password" spellCheck={false} autoCapitalize="none" aria-describedby="business-key-privacy" /></label><p id="business-key-privacy" className={styles.note}>{t.writeOnly}</p><div><button type="submit" className={styles.button} disabled={keySaving || !access.encryptionReady || !apiKey.trim()}>{keySaving ? t.saving : credential ? t.replaceKey : t.saveKey}</button></div></form><p className={styles.note}>{t.noPaidPreview}</p></> : tab === "create" ? <>
          {!access.keyConfigured ? <div className={styles.empty}><h2 className={styles.heading}>{t.keyTitle}</h2><p>{t.keyNeeded}</p><button className={styles.button} type="button" onClick={() => setTab("key")}>{t.keyTab}</button></div> : <><div className={styles.panelHead}><p className={styles.description} style={{ margin: 0 }}>{t.catalogNotice}</p><button className={styles.small} type="button" disabled={modelsLoading} onClick={loadModels}>{modelsLoading ? t.checking : t.refresh}</button></div><form className={styles.form} onSubmit={requestConfirmation}>
            <div className={styles.row} role="group" aria-label={t.createTab}>{(["image", "video", "text"] as const).map(value => <button type="button" key={value} className={kind === value ? styles.button : styles.secondary} aria-pressed={kind === value} onClick={() => chooseKind(value)}>{t[value]}</button>)}</div>
            <label className={styles.field}>{t.model}<select required value={selected?.id ?? ""} onChange={e => chooseModel(e.target.value)} disabled={modelsLoading || !selectedModels.length}>{!selectedModels.length ? <option value="">{t.emptyModels}</option> : selectedModels.map(model => <option key={model.id} value={model.id}>{model.displayName}{model.nsfw ? ` · ${t.nsfw}` : ""}</option>)}</select></label>
            {selected?.nsfw ? <span className={styles.sensitive}>{t.nsfw}</span> : null}
            <label className={styles.field}>{t.prompt}<textarea required value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={selected?.promptMaxChars ?? 12000} placeholder={t.promptPlaceholder} aria-describedby="business-prompt-note" style={{ minHeight: 190 }} /><span id="business-prompt-note" className={styles.note}>{prompt.length.toLocaleString()} / {(selected?.promptMaxChars ?? 12000).toLocaleString()} · {t.keyWarning}</span></label>
            <div className={styles.settings}>{kind === "image" && selected?.sizes?.length ? <label className={styles.field}>{t.size}<select value={selectedSize} onChange={e => setSize(e.target.value)}>{selected.sizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
              {kind === "video" ? <><label className={styles.field}>{t.duration}{selected?.secondsOptions?.length ? <select value={selectedSeconds} onChange={e => setSeconds(Number(e.target.value))}>{selected.secondsOptions.map(value => <option key={value} value={value}>{value}</option>)}</select> : <input type="number" min={selected?.minSeconds ?? 2} max={selected?.maxSeconds ?? 15} step={1} value={selectedSeconds} required onChange={e => setSeconds(Number(e.target.value))} />}</label>{selected?.resolutions?.length ? <label className={styles.field}>{t.resolution}<select value={selectedResolution} onChange={e => setResolution(e.target.value)}>{selected.resolutions.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}{selected?.aspectRatios?.length ? <label className={styles.field}>{t.aspect}<select value={selectedAspect} onChange={e => setAspect(e.target.value)}>{selected.aspectRatios.map(value => <option value={value} key={value}>{value}</option>)}</select></label> : null}</> : null}
            </div>{kind === "video" && selected?.supportsAudio ? <label className={styles.check}><input type="checkbox" checked={selected.nativeAudioOnly || (supportsAudioAtResolution && audio)} disabled={selected.nativeAudioOnly || !supportsAudioAtResolution} onChange={e => setAudio(e.target.checked)} />{t.audio}</label> : null}
            {selected?.supportsReferences ? <div><p className={styles.description}>{t.references}</p><p className={styles.note}>{t.referenceText.replace("{n}", String(referenceLimit))}</p>{assets.length ? <div className={styles.assetGrid}>{assets.slice(0, 100).map(asset => <button type="button" key={asset.id} className={styles.asset} aria-pressed={assetIds.includes(asset.id)} title={assetIds.includes(asset.id) ? t.removeReference : t.selectReference} disabled={!assetIds.includes(asset.id) && assetIds.length >= referenceLimit} onClick={() => setAssetIds(current => current.includes(asset.id) ? current.filter(id => id !== asset.id) : [...current, asset.id])}><Image src={asset.src} alt={asset.name} loading="lazy" width={200} height={100} unoptimized /><span>{asset.name}</span></button>)}</div> : <p className={styles.note}>{t.noAssets}</p>}<Link href="/assets" className={styles.subtleLink}>{t.assetsLink} ↗</Link></div> : null}
            {selected?.id === "minimax-h3" || selected?.id === "minimax-h3-max" ? <p className={styles.warning}>{selected.id === "minimax-h3" ? t.minimaxH3References : t.minimaxH3MaxReferences}</p> : null}<p className={styles.note}>{t.providerBilling} · {t.noCredits}<br />{t.noQuote}</p><div><button type="submit" className={styles.button} disabled={submitting || uncertain || !selected || !prompt.trim() || (selected.nsfw && !access.adultVerified)}>{submitting ? t.generating : t.generate} <span aria-hidden="true">↗</span></button></div>
          </form>{selected?.nsfw && !access.adultVerified ? <BusinessAdultDeclaration copy={t} onVerified={refreshAccess} /> : null}</>}
        </> : <><div className={styles.panelHead}><div><h2 className={styles.heading}>{t.historyTitle}</h2><p className={styles.description}>{t.secureNotice}</p></div><button className={styles.small} type="button" disabled={historyLoading} onClick={() => loadHistory(true)}>{historyLoading ? t.checking : t.refresh}</button></div><p className={styles.note}>{t.manualRefresh}<br />{t.billingNotice}</p>
          {jobs.length ? <div className={styles.history}>{jobs.map(job => <article key={job.id} className={styles.work}><div className={styles.workHeader}><div><h3>{job.model} {job.nsfw ? <span className={styles.sensitive}>{t.nsfw}</span> : null}</h3><time dateTime={job.createdAt}>{dateLabel(job.createdAt)}</time></div><span className={styles.status}>{t[job.status]}</span></div>{job.videoUrl || job.images?.length ? <div className={styles.workMedia}>{job.videoUrl ? <video src={job.videoUrl} controls preload="metadata" playsInline aria-label={job.model} /> : job.images?.map((image, index) => <a key={image.url} href={image.url} target="_blank" rel="noreferrer" aria-label={`${t.view} ${index + 1}`}><Image src={image.url} alt={`${job.model} · ${index + 1}`} loading="lazy" width={960} height={960} unoptimized /></a>)}</div> : null}{job.text ? <div className={styles.workText}>{job.text}</div> : null}{job.errorCode ? <p className={styles.feedback}>{businessError(t, job.errorCode)}</p> : null}<details className={styles.promptDetails}><summary>{t.promptUsed}</summary><p>{job.prompt}</p></details><p className={styles.request}>{t.requestId}: {job.id}</p>{job.videoUrl ? <a className={styles.subtleLink} href={job.videoUrl} download target="_blank" rel="noreferrer">{t.download} ↗</a> : null}</article>)}</div> : <div className={styles.empty}><h3>{t.emptyHistory}</h3><p>{t.emptyHistoryText}</p></div>}
        </>}
      </section>
      {uncertain ? <aside className={styles.warning} role="status">{t.uncertain}<div className={styles.row} style={{ marginTop: 12 }}><button type="button" className={styles.small} disabled={historyLoading} onClick={() => loadHistory(true)}>{historyLoading ? t.checking : t.checkOriginal}</button></div></aside> : null}
    </>}
    <footer className={styles.note} style={{ borderTop: "1px solid #2c3a31", paddingTop: 22 }}>THE BLUE WING / BYOK<br />{t.secureNotice}</footer>
    {confirmation ? <BusinessDialog title={t.confirmTitle} busy={submitting} onClose={() => setConfirmation(null)}><p>{t.confirmText}</p><dl><dt>{t.model}</dt><dd>{models.find(model => model.id === confirmation.parameters.model)?.displayName ?? confirmation.parameters.model}</dd><dt>{t.providerBilling}</dt><dd>{t.noCredits}</dd>{credential ? <><dt>{t.last4}</dt><dd>•••• {credential.last4}</dd></> : null}{confirmation.parameters.assetIds?.length ? <><dt>{t.references}</dt><dd>{confirmation.parameters.assetIds.length}</dd></> : null}{confirmation.kind === "video" ? <><dt>{t.duration}</dt><dd>{confirmation.parameters.seconds}s · {confirmation.parameters.resolution}</dd></> : null}</dl><p className={styles.dialogPrompt}>{confirmation.parameters.prompt}</p><p>{t.noQuote}</p>{confirmation.parameters.model === "minimax-h3" || confirmation.parameters.model === "minimax-h3-max" ? <p className={styles.warning}>{confirmation.parameters.model === "minimax-h3" ? t.minimaxH3References : t.minimaxH3MaxReferences}</p> : null}<p className={styles.note}>{t.billingNotice}</p><div className={styles.dialogActions}><button className={styles.button} type="button" onClick={submitGeneration} disabled={submitting}>{submitting ? t.generating : t.confirm}</button><button className={styles.secondary} type="button" onClick={() => setConfirmation(null)} disabled={submitting}>{t.cancel}</button></div></BusinessDialog> : null}
    {deleteOpen ? <BusinessDialog title={t.deleteTitle} busy={keySaving} onClose={() => setDeleteOpen(false)}><p>{t.deleteText}</p><div className={styles.dialogActions}><button className={styles.button} type="button" onClick={deleteKey} disabled={keySaving}>{keySaving ? t.saving : t.deleteKey}</button><button className={styles.secondary} type="button" onClick={() => setDeleteOpen(false)} disabled={keySaving}>{t.cancel}</button></div></BusinessDialog> : null}
  </div></div>;
}
