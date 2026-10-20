"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n/client";
import { businessCopy, businessError } from "@/lib/i18n/business";
import { klingCopy } from "@/lib/i18n/kling";
import type { BusinessAccess, BusinessCredential, BusinessGeneration, BusinessKind, BusinessModel, BusinessSubmission, BusinessAsset, BusinessProviderAsset, BusinessUnavailableModel } from "./types";
import BusinessAdultDeclaration from "./BusinessAdultDeclaration";
import BusinessDialog from "./BusinessDialog";
import BusinessStudioNav from "./BusinessStudioNav";
import BusinessStage from "./BusinessStage";
import BusinessSeedanceControls from "./BusinessSeedanceControls";
import BusinessAssets, { type BusinessAssetRecord } from "./BusinessAssets";
import BusinessUsage from "./BusinessUsage";
import BusinessModelCatalog from "./BusinessModelCatalog";
import BusinessGenerationReceipt from "./BusinessGenerationReceipt";
import BusinessImageControls from "./BusinessImageControls";
import BusinessDedicatedVideoControls, { DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS, type BusinessDedicatedVideoOptions } from "./BusinessDedicatedVideoControls";
import { buildBusinessDedicatedVideoPayload } from "@/lib/businessDedicatedVideo";
import { businessDedicatedVideoCopy } from "@/lib/i18n/businessDedicatedVideo";
import { businessOperationsCopy } from "@/lib/i18n/businessOperations";
import { assertBusinessSeedanceReferences, buildBusinessSeedancePayload, type BusinessSeedanceMode } from "@/lib/businessSeedance";
import { businessSeedanceCopy } from "@/lib/i18n/businessSeedance";
import { businessStudioCopy } from "@/lib/i18n/businessStudio";
import { businessStudioHref, parseBusinessStudioLocation, type BusinessStudioTab } from "@/lib/businessStudio";
import styles from "./Business.module.css";
import studio from "./BusinessStudio.module.css";

const REQUEST_HEADERS = { "Content-Type": "application/json" };
// The API guarantees these failures occurred before a paid provider request.
const PRE_SUBMIT_ERRORS = new Set(["invalid_origin", "invalid_body", "invalid_parameters", "invalid_reference", "business_asset_unavailable", "model_unavailable", "age_unverified", "credential_required", "credential_changed", "credential_validation_failed", "prompt_blocked", "too_many_concurrent", "business_not_approved", "business_suspended", "encryption_unavailable", "credential_unavailable"]);
const isPending = (job: BusinessGeneration) => ["submitting", "processing", "unknown"].includes(job.status);

export default function BusinessWorkspace() {
  const locale = useLocale();
  const t = businessCopy(locale);
  const klingText = klingCopy(locale);
  const s = businessStudioCopy(locale);
  const d = businessSeedanceCopy(locale);
  const dedicatedCopy = businessDedicatedVideoCopy(locale);
  const operations = businessOperationsCopy(locale);
  const router = useRouter();
  const search = useSearchParams();
  const { kind, modelId, tab } = parseBusinessStudioLocation(search);
  const [navigationPending, startTransition] = useTransition();
  const [access, setAccess] = useState<BusinessAccess | null>(null);
  const [auth, setAuth] = useState<"loading" | "signedOut" | "unverified" | "signedIn">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState("");
  const [useCase, setUseCase] = useState("");
  const [applying, setApplying] = useState(false);
  const [credential, setCredential] = useState<BusinessCredential | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [keyLabel, setKeyLabel] = useState("SIRAYA");
  const [keySaving, setKeySaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [models, setModels] = useState<BusinessModel[]>([]);
  const [unavailableModels, setUnavailableModels] = useState<BusinessUnavailableModel[]>([]);
  const [upstreamTotal, setUpstreamTotal] = useState(0);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("");
  const [resolution, setResolution] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [aspect, setAspect] = useState("16:9");
  const [audio, setAudio] = useState(false);
  const [assets, setAssets] = useState<BusinessAsset[]>([]);
  const [assetIds, setAssetIds] = useState<number[]>([]);
  const [videoMode, setVideoMode] = useState<BusinessSeedanceMode>("freestyle");
  const [providerAssets, setProviderAssets] = useState<BusinessProviderAsset[]>([]);
  const [referenceOrder, setReferenceOrder] = useState<string[]>([]);
  const [outputFormat, setOutputFormat] = useState<"mp4" | "mov">("mp4");
  const [seed, setSeed] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [imageQuality, setImageQuality] = useState("");
  const [imageNegative, setImageNegative] = useState("");
  const [imageBusinessAssets, setImageBusinessAssets] = useState<BusinessProviderAsset[]>([]);
  const [dedicatedOptions, setDedicatedOptions] = useState<BusinessDedicatedVideoOptions>({ ...DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS });
  const [jobs, setJobs] = useState<BusinessGeneration[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<BusinessSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitLock = useRef(false);
  const keyLock = useRef(false);
  const unresolvedRequest = useRef<string | null>(null);
  const selectionContext = useRef<string | null>(null);
  const selectedModels = models.filter(model => model.modality === kind);
  const selected = selectedModels.find(model => model.id === modelId)
    ?? selectedModels.find(model => !model.nsfw && (!model.dedicatedVideo || model.dedicatedVideo.capability === "text-to-video"))
    ?? selectedModels.find(model => !model.nsfw)
    ?? selectedModels[0];
  const promptLimit = selected?.dedicatedVideo?.cjkPromptMaxChars && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prompt) ? selected.dedicatedVideo.cjkPromptMaxChars : selected?.promptMaxChars ?? 12000;
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
      setUnavailableModels(data.unavailableModels ?? []); setUpstreamTotal(data.upstreamTotal ?? data.models?.length ?? 0);
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
      resetSelection(); setCredential(data.credential ?? null); setModels([]); await refreshAccess(); await loadModels(); setNotice(t.keySaved);
    } catch { setError(t.unavailable); }
    finally { setApiKey(""); keyLock.current = false; setKeySaving(false); }
  };
  const deleteKey = async () => {
    if (keyLock.current) return; keyLock.current = true; setKeySaving(true); setError("");
    try {
      const response = await fetch("/api/business/credentials", { method: "DELETE" });
      if (!response.ok) { setError(t.error); return; }
      resetSelection(); setCredential(null); setModels([]); setUnavailableModels([]); setUpstreamTotal(0); setApiKey(""); await refreshAccess(); setNotice(t.keyDeleted); setDeleteOpen(false);
    } catch { setError(t.unavailable); }
    finally { keyLock.current = false; setKeySaving(false); }
  };
  const resetSelection = useCallback(() => { setSize(""); setResolution(""); setAssetIds([]); setAudio(false); setApiKey(""); setVideoMode("freestyle"); setProviderAssets([]); setReferenceOrder([]); setOutputFormat("mp4"); setSeed(""); setImageCount(1); setImageQuality(""); setImageNegative(""); setImageBusinessAssets([]); setDedicatedOptions({ ...DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS }); if (!submitLock.current) setConfirmation(null); }, [setConfirmation, setApiKey]);
  const navigate = (nextKind: BusinessKind, nextModel: string, nextTab: BusinessStudioTab) => startTransition(() => router.push(businessStudioHref({ kind: nextKind, modelId: nextModel, tab: nextTab }), { scroll: false }));
  const setTab = (value: BusinessStudioTab) => navigate(kind, selected?.id ?? "", value);
  const chooseTab = (value: BusinessStudioTab) => { if (submitLock.current) return; if (!submitLock.current) setConfirmation(null); setApiKey(""); setError(""); setNotice(""); setTab(value); };
  const chooseKind = (value: BusinessKind) => { if (submitLock.current) return; resetSelection(); setApiKey(""); navigate(value, "", "create"); };
  const chooseModel = (value: string) => { if (submitLock.current) return; const model = models.find(item => item.id === value); if (!model) return; resetSelection(); setSeconds(model.defaultSeconds ?? Math.min(model.maxSeconds ?? 5, Math.max(model.minSeconds ?? 2, 5))); navigate(model.modality, model.id, "create"); };
  const chooseVideoMode = (value: BusinessSeedanceMode) => { if (submitLock.current) return; setVideoMode(value); setAssetIds([]); setProviderAssets([]); setReferenceOrder([]); setConfirmation(null); setSeconds(value === "video-edit" || value === "video-extend" ? -1 : selected?.defaultSeconds ?? 5); };
  const toggleLocalReference = (id: number) => { if (submitLock.current) return; const exists = assetIds.includes(id); const key = `local:${id}`; setAssetIds(current => exists ? current.filter(value => value !== id) : [...current, id]); setReferenceOrder(current => exists ? current.filter(value => value !== key) : [...current, key]); setConfirmation(null); };
  const toggleProviderReference = (asset: BusinessProviderAsset) => { if (submitLock.current) return; const exists = providerAssets.some(value => value.id === asset.id); const key = `provider:${asset.id}`; setProviderAssets(current => exists ? current.filter(value => value.id !== asset.id) : [...current, asset]); setReferenceOrder(current => exists ? current.filter(value => value !== key) : [...current, key]); setConfirmation(null); };
  const chooseDedicatedOptions = (value: BusinessDedicatedVideoOptions) => { if (submitLock.current) return; if (value.mode !== dedicatedOptions.mode) setImageBusinessAssets([]); setDedicatedOptions(value); setConfirmation(null); };
  const selectManagedAsset = (asset: BusinessAssetRecord) => {
    if (submitLock.current || !selected) return;
    if (kind === "video" && selected.seedance) {
      if (asset.status !== "active") return;
      const next = providerAssets.some(value => value.id === asset.id) ? providerAssets.filter(value => value.id !== asset.id) : [...providerAssets, asset];
      const counts = { image: assetIds.length, video: 0, audio: 0 }; next.forEach(reference => { counts[reference.type]++; });
      const frameMode = videoMode === "image-to-video" || videoMode === "first-last-frame";
      const limit = videoMode === "text-to-video" ? 0 : videoMode === "image-to-video" ? 1 : videoMode === "first-last-frame" ? 2 : selected.seedance.references.total;
      if (assetIds.length + next.length > limit || (frameMode && (counts.video > 0 || counts.audio > 0)) || Object.entries(counts).some(([type, count]) => count > selected.seedance!.references[type as "image" | "video" | "audio"])) { setError(d.referenceLimitError); return; }
      toggleProviderReference(asset); chooseTab("create");
    } else if ((kind === "image" || kind === "video" && selected.dedicatedVideo) && asset.type === "image" && asset.uploadId && asset.storageReady) {
      const next = imageBusinessAssets.some(value => value.uploadId === asset.uploadId) ? imageBusinessAssets.filter(value => value.uploadId !== asset.uploadId) : [...imageBusinessAssets, asset];
      const mode = dedicatedOptions.mode === "freestyle" ? selected.dedicatedVideo?.capability : dedicatedOptions.mode;
      const limit = selected.dedicatedVideo ? mode === "image-to-video" ? 1 : mode === "first-last-frame" ? 2 : selected.dedicatedVideo.maxReferenceImages : selected.maxReferenceImages ?? 4;
      if (next.length + assetIds.length > limit) { setError(d.referenceLimitError); return; }
      setImageBusinessAssets(next); setConfirmation(null); chooseTab("create");
    }
  };
  useEffect(() => {
    const next = `${kind}:${selected?.id ?? modelId}`;
    if (selectionContext.current !== null && selectionContext.current !== next) {
      resetSelection();
    }
    selectionContext.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- discard unsaved secrets when navigating between workspace panels
    setApiKey("");
  }, [kind, modelId, selected?.id, tab, resetSelection]);
  const requestConfirmation = (event: React.FormEvent) => {
    event.preventDefault(); if (submitLock.current || navigationPending || uncertain || !selected || !prompt.trim()) return;
    if (prompt.length > (selected.promptMaxChars ?? 12000)) { setError(klingText.promptLimit); return; }
    if (assetIds.length + (kind === "image" || selected.dedicatedVideo ? imageBusinessAssets.length : 0) > (selected.seedance?.references.image ?? selected.maxReferenceImages ?? 4)) { setError(d.referenceLimitError); return; }
    if (selected.nsfw && !access?.adultVerified) { setError(t.ageRequired); return; }
    if (/\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/.test(prompt)) { setError(t.keyWarning); return; }
    const parameters: BusinessSubmission["parameters"] = { model: selected.id, prompt: prompt.trim() };
    if (kind === "image") {
      if (!Number.isSafeInteger(imageCount) || imageCount < 1 || imageCount > (selected.maxImageCount ?? 1)) { setError(t.invalidRequest); return; }
      parameters.n = imageCount; const outputSize = size || selected.sizes?.[0]; if (outputSize) parameters.size = outputSize;
      if (imageQuality && selected.imageControls?.some(control => control.key === "quality")) parameters.quality = imageQuality;
      if (imageNegative.trim() && selected.imageControls?.some(control => control.key === "negative_prompt")) parameters.negative_prompt = imageNegative.trim();
      if (seed.trim() && selected.imageControls?.some(control => control.key === "seed")) { const value = Number(seed); if (!Number.isSafeInteger(value) || value < -1 || value > 2147483647) { setError(t.invalidRequest); return; } parameters.seed = value; }
      if (imageBusinessAssets.length) parameters.businessAssetIds = imageBusinessAssets.map(asset => asset.uploadId!);
    }
    if (kind === "video") { parameters.seconds = selected.secondsOptions?.length && !selected.secondsOptions.includes(seconds) ? selected.defaultSeconds ?? selected.secondsOptions[0] : Math.max(selected.minSeconds ?? 2, Math.min(seconds, selected.maxSeconds ?? 30)); parameters.resolution = resolution || selected.resolutions?.[0]; const outputAspect = selected.aspectRatios?.includes(aspect) ? aspect : selected.aspectRatios?.[0]; if (outputAspect) parameters.aspect_ratio = outputAspect; if (selected.supportsAudio) parameters.generate_audio = selected.nativeAudioOnly || (!selected.nativeAudioResolutions || selected.nativeAudioResolutions.includes(parameters.resolution ?? "")) && audio; }
    if (kind === "text") parameters.max_tokens = 1024;
    if (selected.supportsReferences && assetIds.length) parameters.assetIds = [...assetIds];
    if (kind === "video" && selected.seedance) {
      try { assertBusinessSeedanceReferences(selected.seedance, videoMode, [...assetIds.map(() => ({ type: "image" as const })), ...providerAssets]); }
      catch { setError(d.referenceLimitError); return; }
      parameters.mode = videoMode;
      parameters.seconds = seconds === -1 || providerAssets.some(asset => asset.type === "video") || videoMode === "video-edit" || videoMode === "video-extend" ? -1 : parameters.seconds;
      if (selected.seedance.version === "2.5" && ["image-to-video", "first-last-frame", "video-edit", "video-extend"].includes(videoMode)) parameters.aspect_ratio = "adaptive";
      if (providerAssets.length) parameters.providerAssets = providerAssets.map(({ id, type }) => ({ id, type }));
      if (assetIds.length || providerAssets.length) parameters.referenceOrder = [...referenceOrder];
      if (selected.seedance.version === "2.5") parameters.output_format = outputFormat;
      if (seed.trim()) { const value = Number(seed); if (!Number.isSafeInteger(value) || value < -1 || value > 2147483647) { setError(t.invalidRequest); return; } parameters.seed = value; }
      try {
        // Validate the same scalar/mode contract as the server before opening
        // paid confirmation. Placeholder URLs never read or transmit media.
        buildBusinessSeedancePayload(parameters, [...assetIds.map(() => ({ type: "image" as const })), ...providerAssets].map((reference, index) => ({ type: reference.type, url: `owned-reference-${index}` })));
      } catch { setError(t.invalidRequest); return; }
    }
    if (kind === "video" && selected.dedicatedVideo) {
      // This provider contract uses native business uploads. Consumer image IDs
      // and Seedance's provider asset:// handles are deliberately not accepted.
      if (assetIds.length || providerAssets.length || referenceOrder.length || imageBusinessAssets.some(asset => asset.type !== "image" || !asset.uploadId)) { setError(t.invalidRequest); return; }
      parameters.mode = dedicatedOptions.mode === "freestyle" ? selected.dedicatedVideo.capability : dedicatedOptions.mode;
      parameters.watermark = dedicatedOptions.watermark;
      if (imageBusinessAssets.length) parameters.businessAssetIds = imageBusinessAssets.map(asset => asset.uploadId!);
      if (dedicatedOptions.seed.trim()) { const value = Number(dedicatedOptions.seed); if (!Number.isSafeInteger(value)) { setError(t.invalidRequest); return; } parameters.seed = value; }
      if (selected.dedicatedVideo.family === "wan2.7") { parameters.prompt_extend = dedicatedOptions.promptExtend; if (dedicatedOptions.negativePrompt.trim()) parameters.negative_prompt = dedicatedOptions.negativePrompt.trim(); }
      if (selected.dedicatedVideo.aspectRatioFromSource) delete parameters.aspect_ratio;
      try { buildBusinessDedicatedVideoPayload(parameters, imageBusinessAssets.map((_, index) => ({ type: "image", url: `https://owned.invalid/reference-${index}.png` }))); }
      catch { setError(t.invalidRequest); return; }
    }
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
  const seedanceAdaptive = selected?.seedance?.version === "2.5" && ["image-to-video", "first-last-frame", "video-edit", "video-extend"].includes(videoMode);
  const seedanceVideoDuration = !!selected?.seedance && (providerAssets.some(asset => asset.type === "video") || videoMode === "video-edit" || videoMode === "video-extend");
  const seedanceAutoDuration = !!selected?.seedance && (seconds === -1 || seedanceVideoDuration);
  const selectedAspect = seedanceAdaptive ? "adaptive" : selected?.aspectRatios?.includes(aspect) ? aspect : selected?.aspectRatios?.[0] ?? "";
  const selectedSeconds = seedanceAutoDuration ? -1 : selected?.secondsOptions?.length && !selected.secondsOptions.includes(seconds) ? selected.defaultSeconds ?? selected.secondsOptions[0] : Math.max(selected?.minSeconds ?? 2, Math.min(seconds, selected?.maxSeconds ?? 30));
  const supportsAudioAtResolution = !selected?.nativeAudioResolutions || selected.nativeAudioResolutions.includes(selectedResolution);
  const referenceLimit = selected?.seedance?.references.image ?? selected?.maxReferenceImages ?? 4;
  const dateLabel = (date: string) => { const parsed = new Date(date); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed); };

  return <div className={studio.shell} data-business-workspace>
    <BusinessStudioNav copy={s} business={t} approved={approved} keyConfigured={!!access?.keyConfigured} modelsLoading={modelsLoading} models={models} kind={kind} selectedId={selected?.id ?? ""} tab={tab} onKind={chooseKind} onModel={chooseModel} onTab={chooseTab} />
    <div className={studio.body}>
    {approved ? <header className={studio.workspaceHeader}><div><p className={styles.eyebrow}>{access.account?.companyName} / {s.studioLabel}</p><h1>{tab === "create" ? s[`${kind}Title`] : tab === "key" ? t.keyTab : tab === "assets" ? operations.assetTitle : tab === "usage" ? operations.usage : tab === "models" ? operations.models : t.historyTab}</h1><p>{tab === "create" ? s[`${kind}Description`] : tab === "key" ? t.keyText : tab === "assets" ? operations.assetDescription : tab === "usage" ? operations.usageDescription : tab === "models" ? operations.modelsDescription : t.secureNotice}</p></div><div className={studio.workspaceMeta}><span className={styles.status}>{t.approved}</span><span className={studio.keyStatus} data-connected={access.keyConfigured}>{access.keyConfigured ? s.keyConnected : t.notConfigured}</span><button className={styles.small} onClick={refresh} disabled={loading}>{loading ? t.checking : t.refresh}</button></div></header> : null}
    <div className={studio.workspaceBody}><div className={approved ? studio.activeContent : styles.inner}>
    {!approved ? <>
    <header className={styles.hero}><div><p className={styles.eyebrow}>{t.eyebrow}</p><h1>{t.title}</h1><p>{t.description}</p></div><div className={styles.heroArt} aria-hidden="true"><i className={styles.artLine} /><i className={styles.artLine} /><i className={styles.artLine} /><span className={styles.artCaption}>{s.studioLabel}</span></div></header>
    <div className={styles.principles}>{[[t.independent, t.independentText], [t.ownKey, t.ownKeyText], [t.ownCosts, t.ownCostsText]].map(([title, text], index) => <section className={styles.principle} key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{text}</p></section>)}</div>
    </> : null}
    {error ? <p role="alert" className={styles.feedback}>{error}</p> : null}{notice ? <p role="status" className={styles.success}>{notice}</p> : null}
    {auth === "loading" ? <p className={styles.description} role="status">{t.loading}</p> : auth === "signedOut" ? <section className={styles.panel}><h2 className={styles.heading}>{t.loginTitle}</h2><p className={styles.description}>{t.loginText}</p><div className={styles.row} style={{ marginTop: 24 }}><Link href="/login?next=%2Fbusiness" className={styles.button}>{t.login}</Link></div></section> : auth === "unverified" ? <p className={styles.warning}>{t.verifyEmail}</p> : !access ? <section className={styles.panel}><button className={styles.secondary} onClick={refresh} disabled={loading}>{t.refresh}</button></section> : !approved ? <section className={styles.panel}>
      <div className={styles.panelHead}><div><h2 className={styles.heading}>{t.applyTitle}</h2><p className={styles.description}>{t.applyText}</p></div><button type="button" className={styles.small} onClick={refresh} disabled={loading}>{loading ? t.checking : t.refresh}</button></div>
      {access.account ? <div className={styles.stateCard}><span className={styles.status}>{t[access.account.status]}</span><p>{access.account.status === "pending" ? t.pendingText : access.account.status === "rejected" ? t.rejectedText : t.suspendedText}</p>{access.account.reviewNote ? <p className={styles.review}><strong>{t.reviewNote}</strong><br />{access.account.reviewNote}</p> : null}</div> : null}
      {access.account?.status !== "suspended" ? <form className={styles.form} onSubmit={apply}><label className={styles.field}>{t.company}<input required minLength={1} maxLength={120} value={company} onChange={e => setCompany(e.target.value)} placeholder={t.companyPlaceholder} autoComplete="organization" /></label><label className={styles.field}>{t.useCase}<textarea required minLength={10} maxLength={2000} value={useCase} onChange={e => setUseCase(e.target.value)} placeholder={t.useCasePlaceholder} /></label><div><button type="submit" className={styles.button} disabled={applying}>{applying ? t.applying : access.account ? t.reapply : t.apply}</button></div></form> : null}
    </section> : <>
      <section id={`business-panel-${tab}`} aria-label={tab === "create" ? t.createTab : tab === "key" ? t.keyTab : t.historyTab} className={tab === "create" ? studio.createLayout : styles.panel}>
        {tab === "assets" ? <BusinessAssets imageOnly={kind === "image" || !!selected?.dedicatedVideo} onSelect={selected?.seedance || ((kind === "image" || !!selected?.dedicatedVideo) && selected?.supportsReferences) ? selectManagedAsset : undefined} selectedIds={kind === "image" || selected?.dedicatedVideo ? imageBusinessAssets.map(asset => asset.uploadId ?? asset.id) : providerAssets.map(asset => asset.id)} /> : tab === "usage" ? <BusinessUsage /> : tab === "models" ? <BusinessModelCatalog models={models} unavailableModels={unavailableModels} upstreamTotal={upstreamTotal} loading={modelsLoading} onRefresh={() => void loadModels()} onChoose={chooseModel} /> : tab === "key" ? <><div className={styles.panelHead}><div><h2 className={styles.heading}>{t.keyTitle}</h2><p className={styles.description}>{t.keyText}</p></div></div>{credential ? <div className={styles.keyCard}><div><strong>{credential.label}</strong><p>{t.configured} · {t.last4} •••• {credential.last4}</p><p>{dateLabel(credential.updatedAt)}</p></div><button className={styles.small} type="button" onClick={() => setDeleteOpen(true)} disabled={keySaving}>{t.deleteKey}</button></div> : <p className={styles.note}>{t.notConfigured}</p>}
          {!access.encryptionReady ? <p className={styles.warning}>{t.encryptionUnavailable}</p> : null}<form className={styles.form} onSubmit={saveKey} autoComplete="off"><label className={styles.field}>{t.keyLabel}<input value={keyLabel} onChange={e => setKeyLabel(e.target.value)} maxLength={64} required autoComplete="off" /></label><label className={styles.field}>{t.apiKey}<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} required placeholder={t.keyPlaceholder} maxLength={203} autoComplete="new-password" spellCheck={false} autoCapitalize="none" aria-describedby="business-key-privacy" /></label><p id="business-key-privacy" className={styles.note}>{t.writeOnly}</p><div><button type="submit" className={styles.button} disabled={keySaving || !access.encryptionReady || !apiKey.trim()}>{keySaving ? t.saving : credential ? t.replaceKey : t.saveKey}</button></div></form><p className={styles.note}>{t.noPaidPreview}</p></> : tab === "create" ? <><BusinessStage movNotice={d.movNotice} copy={s} business={t} kind={kind} model={selected} job={jobs.find(job => job.kind === kind && (!job.nsfw || selected?.nsfw))} onHistory={() => chooseTab("history")} onRefresh={() => void loadHistory(true)} refreshing={historyLoading} onJobUpdated={job => setJobs(current => current.map(old => old.id === job.id ? job : old))} /><div className={studio.editor}>
          {!access.keyConfigured ? <div className={styles.empty}><h2 className={styles.heading}>{t.keyTitle}</h2><p>{t.keyNeeded}</p><button className={styles.button} type="button" onClick={() => chooseTab("key")}>{t.keyTab}</button></div> : <><div className={studio.editorHeader}><h2>{s.parametersTitle}</h2><button className={styles.small} type="button" disabled={modelsLoading} onClick={loadModels}>{modelsLoading ? t.checking : t.refresh}</button></div><form className={studio.editorForm} onSubmit={requestConfirmation}>
            <label className={styles.field}>{t.model}<select required value={selected?.id ?? ""} onChange={e => chooseModel(e.target.value)} disabled={modelsLoading || !selectedModels.length}>{!selectedModels.length ? <option value="">{t.emptyModels}</option> : selectedModels.map(model => <option key={model.id} value={model.id}>{model.displayName}{model.nsfw ? ` · ${t.nsfw}` : ""}</option>)}</select></label>
            {selected?.nsfw ? <span className={styles.sensitive}>{t.nsfw}</span> : null}
            <label className={styles.field}>{t.prompt}<textarea required value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={promptLimit} placeholder={t.promptPlaceholder} aria-describedby="business-prompt-note" style={{ minHeight: 190 }} /><span id="business-prompt-note" className={styles.note}>{prompt.length.toLocaleString()} / {promptLimit.toLocaleString()} · {t.keyWarning}</span></label>
            <div className={styles.settings}>{kind === "image" && selected?.sizes?.length ? <label className={styles.field}>{t.size}<select value={selectedSize} onChange={e => setSize(e.target.value)}>{selected.sizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
              {kind === "video" ? <><label className={styles.field}>{t.duration}{selected?.seedance ? <><select aria-label={t.duration} value={seedanceAutoDuration ? "auto" : "fixed"} disabled={seedanceVideoDuration} onChange={e => setSeconds(e.target.value === "auto" ? -1 : selected.defaultSeconds ?? 5)}><option value="fixed">{d.fixed}</option><option value="auto">{d.automatic}</option></select>{!seedanceAutoDuration ? <input type="number" min={selected.minSeconds} max={selected.maxSeconds} step={1} value={selectedSeconds} required aria-label={t.duration} onChange={e => setSeconds(Number(e.target.value))} /> : <span className={styles.note}>{d.autoDurationNotice}</span>}</> : selected?.secondsOptions?.length ? <select value={selectedSeconds} onChange={e => setSeconds(Number(e.target.value))}>{selected.secondsOptions.map(value => <option key={value} value={value}>{value}</option>)}</select> : <input type="number" min={selected?.minSeconds ?? 2} max={selected?.maxSeconds ?? 15} step={1} value={selectedSeconds} required onChange={e => setSeconds(Number(e.target.value))} />}</label>{selected?.resolutions?.length ? <label className={styles.field}>{t.resolution}<select value={selectedResolution} onChange={e => setResolution(e.target.value)}>{selected.resolutions.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}{selected?.aspectRatios?.length ? <label className={styles.field}>{t.aspect}<select value={selected.dedicatedVideo?.aspectRatioFromSource ? "source" : selectedAspect} disabled={seedanceAdaptive || selected.dedicatedVideo?.aspectRatioFromSource} onChange={e => setAspect(e.target.value)}>{selected.dedicatedVideo?.aspectRatioFromSource ? <option value="source">{dedicatedCopy.sourceAspect}</option> : selected.aspectRatios.map(value => <option value={value} key={value}>{value}</option>)}</select></label> : null}</> : null}
            </div>{kind === "image" && selected ? <BusinessImageControls model={selected} count={imageCount} onCount={setImageCount} quality={imageQuality} onQuality={setImageQuality} seed={seed} onSeed={setSeed} negative={imageNegative} onNegative={setImageNegative} /> : null}{kind === "video" && selected?.supportsAudio ? <label className={styles.check}><input type="checkbox" checked={selected.nativeAudioOnly || (supportsAudioAtResolution && audio)} disabled={selected.nativeAudioOnly || !supportsAudioAtResolution} onChange={e => setAudio(e.target.checked)} />{t.audio}</label> : null}
            {selected?.seedance ? <BusinessSeedanceControls key={credential?.id ?? "current-key"} capability={selected.seedance} mode={videoMode} onMode={chooseVideoMode} assets={assets} assetIds={assetIds} onLocalSelection={toggleLocalReference} providerAssets={providerAssets} onProviderSelection={toggleProviderReference} referenceOrder={referenceOrder} outputFormat={outputFormat} onOutputFormat={setOutputFormat} seed={seed} onSeed={setSeed} onOpenAssets={() => chooseTab("assets")} /> : null}
            {selected?.dedicatedVideo ? <><BusinessDedicatedVideoControls capability={selected.dedicatedVideo} value={dedicatedOptions} onChange={chooseDedicatedOptions} referenceCount={imageBusinessAssets.length} disabled={submitting} onOpenAssets={() => chooseTab("assets")} />{imageBusinessAssets.length > 0 ? <div className={styles.row}>{imageBusinessAssets.map((asset, index) => <button key={asset.id} type="button" className={styles.small} disabled={submitting} onClick={() => { setImageBusinessAssets(current => current.filter(value => value.id !== asset.id)); setConfirmation(null); }}><span>{index + 1}. {asset.name} ×</span></button>)}</div> : null}</> : null}
            {seedanceAdaptive ? <p className={styles.note}>{d.adaptiveNotice}</p> : null}
            {kind === "image" && selected?.supportsReferences ? <div><button type="button" className={styles.small} onClick={() => chooseTab("assets")}>{operations.openAssets} ↗</button>{imageBusinessAssets.length > 0 && <div className={styles.row} style={{marginTop:12}}>{imageBusinessAssets.map(asset => <button key={asset.id} type="button" className={styles.small} onClick={() => setImageBusinessAssets(current => current.filter(value => value.id !== asset.id))}>{asset.name} ×</button>)}</div>}</div> : null}{selected?.supportsReferences && !selected.seedance && !selected.dedicatedVideo ? <details className={styles.promptDetails}><summary>{t.references} · {assetIds.length + (kind === "image" ? imageBusinessAssets.length : 0)} / {referenceLimit}</summary><p className={styles.note}>{t.referenceText.replace("{n}", String(referenceLimit))}</p>{assets.length ? <div className={styles.assetGrid}>{assets.slice(0, 100).map(asset => <button type="button" key={asset.id} className={styles.asset} aria-pressed={assetIds.includes(asset.id)} title={assetIds.includes(asset.id) ? t.removeReference : t.selectReference} disabled={!assetIds.includes(asset.id) && assetIds.length + (kind === "image" ? imageBusinessAssets.length : 0) >= referenceLimit} onClick={() => setAssetIds(current => current.includes(asset.id) ? current.filter(id => id !== asset.id) : [...current, asset.id])}><Image src={asset.src} alt={asset.name} loading="lazy" width={200} height={100} unoptimized /><span>{asset.name}</span></button>)}</div> : <p className={styles.note}>{t.noAssets}</p>}<button type="button" className={styles.small} onClick={() => chooseTab("assets")}>{operations.openAssets} ↗</button></details> : null}
            {selected?.id === "minimax-h3" || selected?.id === "minimax-h3-max" ? <p className={styles.warning}>{selected.id === "minimax-h3" ? t.minimaxH3References : t.minimaxH3MaxReferences}</p> : null}<p className={styles.note}>{t.providerBilling} · {t.noCredits}<br />{t.noQuote}</p><div><button type="submit" className={styles.button} disabled={submitting || navigationPending || uncertain || !selected || !prompt.trim() || (selected.nsfw && !access.adultVerified)}>{submitting ? t.generating : t.generate} <span aria-hidden="true">↗</span></button></div>
          </form>{selected?.nsfw && !access.adultVerified ? <BusinessAdultDeclaration copy={t} onVerified={refreshAccess} /> : null}<p className={styles.note}>{t.catalogNotice}</p></>}
        </div></> : <><div className={styles.panelHead}><div><h2 className={styles.heading}>{t.historyTitle}</h2><p className={styles.description}>{t.secureNotice}</p></div><button className={styles.small} type="button" disabled={historyLoading} onClick={() => loadHistory(true)}>{historyLoading ? t.checking : t.refresh}</button></div><p className={styles.note}>{t.manualRefresh}<br />{t.billingNotice}</p>
          {jobs.length ? <div className={styles.history}>{jobs.map(job => <article key={job.id} className={styles.work}><div className={styles.workHeader}><div><h3>{job.model} {job.nsfw ? <span className={styles.sensitive}>{t.nsfw}</span> : null}</h3><time dateTime={job.createdAt}>{dateLabel(job.createdAt)}</time></div><span className={styles.status}>{t[job.status]}</span></div>{job.videoUrl || job.images?.length ? <div className={styles.workMedia}>{job.videoUrl ? <video src={job.videoUrl} controls preload="metadata" playsInline aria-label={job.model} /> : job.images?.map((image, index) => <a key={image.url} href={image.url} target="_blank" rel="noreferrer" aria-label={`${t.view} ${index + 1}`}><Image src={image.url} alt={`${job.model} · ${index + 1}`} loading="lazy" width={960} height={960} unoptimized /></a>)}</div> : null}{job.text ? <div className={styles.workText}>{job.text}</div> : null}{job.errorCode ? <p className={styles.feedback}>{businessError(t, job.errorCode)}</p> : null}<details className={styles.promptDetails}><summary>{t.promptUsed}</summary><p>{job.prompt}</p></details><p className={styles.request}>{t.requestId}: {job.id}</p><BusinessGenerationReceipt job={job} onUpdated={updated => setJobs(current => current.map(old => old.id === updated.id ? updated : old))} />{job.videoUrl && /\.mov(?:\?|$)/i.test(job.videoUrl) ? <p className={styles.note}>{d.movNotice}</p> : null}{job.images?.map((image, index) => <a key={image.url} className={styles.subtleLink} href={`${image.url}?download=1`} download>{operations.downloadImage} {index + 1} ↗</a>)}{job.videoUrl ? <a className={styles.subtleLink} href={`${job.videoUrl}?download=1`} download>{t.download} ↗</a> : null}</article>)}</div> : <div className={styles.empty}><h3>{t.emptyHistory}</h3><p>{t.emptyHistoryText}</p></div>}
        </>}
      </section>
      {uncertain ? <aside className={styles.warning} role="status">{t.uncertain}<div className={styles.row} style={{ marginTop: 12 }}><button type="button" className={styles.small} disabled={historyLoading} onClick={() => loadHistory(true)}>{historyLoading ? t.checking : t.checkOriginal}</button></div></aside> : null}
    </>}
    {tab !== "create" || !approved ? <footer className={styles.note} style={{ borderTop: "1px solid #2c3a31", paddingTop: 22 }}>THE BLUE WING / BYOK<br />{t.secureNotice}</footer> : null}
    </div></div></div>
    {confirmation ? <BusinessDialog title={t.confirmTitle} busy={submitting} onClose={() => setConfirmation(null)}><p>{t.confirmText}</p><dl><dt>{t.model}</dt><dd>{models.find(model => model.id === confirmation.parameters.model)?.displayName ?? confirmation.parameters.model}</dd><dt>{t.providerBilling}</dt><dd>{t.noCredits}</dd>{credential ? <><dt>{t.last4}</dt><dd>•••• {credential.last4}</dd></> : null}{confirmation.parameters.mode ? <><dt>{d.mode}</dt><dd>{({ freestyle: d.freestyle, "text-to-video": d.textToVideo, "image-to-video": d.imageToVideo, "first-last-frame": d.firstLastFrame, "subject-reference": d.subjectReference, "video-edit": d.videoEdit, "video-extend": d.videoExtend })[confirmation.parameters.mode]}</dd></> : null}{(confirmation.parameters.assetIds?.length ?? 0) + (confirmation.parameters.providerAssets?.length ?? 0) + (confirmation.parameters.businessAssetIds?.length ?? 0) > 0 ? <><dt>{t.references}</dt><dd>{(confirmation.parameters.assetIds?.length ?? 0) + (confirmation.parameters.providerAssets?.length ?? 0) + (confirmation.parameters.businessAssetIds?.length ?? 0)}</dd></> : null}{confirmation.kind === "image" ? <><dt>{operations.imageCount}</dt><dd>{confirmation.parameters.n ?? 1} · {confirmation.parameters.size}{confirmation.parameters.quality ? ` · ${confirmation.parameters.quality}` : ""}</dd></> : null}{confirmation.kind === "video" ? <><dt>{t.duration}</dt><dd>{confirmation.parameters.seconds === -1 ? d.automatic : `${confirmation.parameters.seconds}s`} · {confirmation.parameters.resolution} · {confirmation.parameters.aspect_ratio ?? (models.find(model => model.id === confirmation.parameters.model)?.dedicatedVideo?.aspectRatioFromSource ? dedicatedCopy.sourceAspect : "")}{confirmation.parameters.output_format ? ` · ${confirmation.parameters.output_format.toUpperCase()}` : ""}</dd></> : null}</dl><p className={styles.dialogPrompt}>{confirmation.parameters.prompt}</p><p>{t.noQuote}</p>{confirmation.parameters.model === "minimax-h3" || confirmation.parameters.model === "minimax-h3-max" ? <p className={styles.warning}>{confirmation.parameters.model === "minimax-h3" ? t.minimaxH3References : t.minimaxH3MaxReferences}</p> : null}<p className={styles.note}>{t.billingNotice}</p><div className={styles.dialogActions}><button className={styles.button} type="button" onClick={submitGeneration} disabled={submitting}>{submitting ? t.generating : t.confirm}</button><button className={styles.secondary} type="button" onClick={() => setConfirmation(null)} disabled={submitting}>{t.cancel}</button></div></BusinessDialog> : null}
    {deleteOpen ? <BusinessDialog title={t.deleteTitle} busy={keySaving} onClose={() => setDeleteOpen(false)}><p>{t.deleteText}</p><div className={styles.dialogActions}><button className={styles.button} type="button" onClick={deleteKey} disabled={keySaving}>{keySaving ? t.saving : t.deleteKey}</button><button className={styles.secondary} type="button" onClick={() => setDeleteOpen(false)} disabled={keySaving}>{t.cancel}</button></div></BusinessDialog> : null}
  </div>;
}
