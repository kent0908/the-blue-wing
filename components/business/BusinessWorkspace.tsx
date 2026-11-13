"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n/client";
import { businessCopy, businessError } from "@/lib/i18n/business";
import { klingCopy } from "@/lib/i18n/kling";
import type { BusinessAccess, BusinessCredential, BusinessGeneration, BusinessKind, BusinessModel, BusinessSubmission, BusinessAsset, BusinessProviderAsset, BusinessReuseSetup, BusinessUnavailableModel } from "./types";
import BusinessAdultDeclaration from "./BusinessAdultDeclaration";
import BusinessDialog from "./BusinessDialog";
import BusinessStudioNav from "./BusinessStudioNav";
import BusinessStage from "./BusinessStage";
import BusinessSeedanceControls from "./BusinessSeedanceControls";
import BusinessAssets, { type BusinessAssetRecord } from "./BusinessAssets";
import BusinessUsage from "./BusinessUsage";
import BusinessModelCatalog from "./BusinessModelCatalog";
import BusinessWorkflows from "./BusinessWorkflows";
import BusinessCollection from "./BusinessCollection";
import { businessResultsCopy } from "@/lib/i18n/businessResults";
import BusinessImageControls from "./BusinessImageControls";
import BusinessPrompt, { type MentionCandidate } from "./BusinessPrompt";
import { allocateMention, orderMentionReferences, resolveMentionPrompt, type MentionBindings, type MentionReference } from "@/lib/businessMentions";
import { businessMentionsCopy } from "@/lib/i18n/businessMentions";
import BusinessDedicatedVideoControls, { BusinessWan3DurationSelect, DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS, type BusinessDedicatedVideoOptions } from "./BusinessDedicatedVideoControls";
import { buildBusinessDedicatedVideoPayload } from "@/lib/businessDedicatedVideo";
import { buildBusinessWan3Payload } from "@/lib/businessWan3";
import { buildBusinessZImagePayload } from "@/lib/businessZImage";
import { businessDedicatedVideoCopy } from "@/lib/i18n/businessDedicatedVideo";
import { businessOperationsCopy } from "@/lib/i18n/businessOperations";
import { businessWorkflowsCopy } from "@/lib/i18n/businessWorkflows";
import { buildBusinessSeedancePayload, seedanceReferenceIssue, seedanceReferenceLimits, type BusinessSeedanceMode } from "@/lib/businessSeedance";
import { businessSeedanceCopy, seedanceReferenceMessage } from "@/lib/i18n/businessSeedance";
import { businessStudioCopy } from "@/lib/i18n/businessStudio";
import { businessStudioHref, parseBusinessStudioLocation, selectBusinessModel, type BusinessStudioTab } from "@/lib/businessStudio";
import styles from "./Business.module.css";
import studio from "./BusinessStudio.module.css";
import workflowStyles from "./BusinessWorkflows.module.css";

const REQUEST_HEADERS = { "Content-Type": "application/json" };
// The API guarantees these failures occurred before a paid provider request.
const PRE_SUBMIT_ERRORS = new Set(["invalid_origin", "invalid_body", "invalid_parameters", "invalid_reference", "business_asset_unavailable", "model_unavailable", "age_unverified", "credential_required", "credential_changed", "credential_validation_failed", "prompt_blocked", "too_many_concurrent", "business_not_approved", "business_suspended", "encryption_unavailable", "credential_unavailable"]);
const isPending = (job: BusinessGeneration) => job.status === "submitting" || job.status === "processing";
const SUBMISSION_TIMEOUT = 60_000;
const RECEIPT_EXPIRY = 6 * 60_000;
type SubmissionReceipt = { requestId: string; expiresAt: number };

function dedicatedImageLimit(mode: BusinessSeedanceMode | undefined, maximum: number): number {
  if (mode === "text-to-video" || mode === "video-extend") return 0;
  if (mode === "image-to-video") return 1;
  if (mode === "first-last-frame") return 2;
  return maximum;
}

export default function BusinessWorkspace() {
  const locale = useLocale();
  const t = businessCopy(locale);
  const resultsCopy = businessResultsCopy(locale);
  const mentionCopy = businessMentionsCopy(locale);
  const mentionBindings = useRef<MentionBindings>({});
  const klingText = klingCopy(locale);
  const s = businessStudioCopy(locale);
  const d = businessSeedanceCopy(locale);
  const dedicatedCopy = businessDedicatedVideoCopy(locale);
  const operations = businessOperationsCopy(locale);
  const workflowsCopy = businessWorkflowsCopy(locale);
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
  const [personalAssetsStatus, setPersonalAssetsStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const personalAssetsRequest = useRef<AbortController | null>(null);
  const [assetIds, setAssetIds] = useState<number[]>([]);
  const [videoMode, setVideoMode] = useState<BusinessSeedanceMode>("freestyle");
  const [providerAssets, setProviderAssets] = useState<BusinessProviderAsset[]>([]);
  const [referenceOrder, setReferenceOrder] = useState<string[]>([]);
  const [outputFormat, setOutputFormat] = useState<"mp4" | "mov">("mp4");
  const [seed, setSeed] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [imageQuality, setImageQuality] = useState("");
  const [imageNegative, setImageNegative] = useState("");
  const [imagePromptExtend, setImagePromptExtend] = useState(false);
  const [imageBusinessAssets, setImageBusinessAssets] = useState<BusinessProviderAsset[]>([]);
  const [dedicatedOptions, setDedicatedOptions] = useState<BusinessDedicatedVideoOptions>({ ...DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS });
  const [jobs, setJobs] = useState<BusinessGeneration[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [promptOnly, setPromptOnly] = useState<{ job: BusinessGeneration; missing: boolean } | null>(null);
  const reuseRequest = useRef<AbortController | null>(null);
  const restoredContext = useRef<string | null>(null);
  const historyLock = useRef(false);
  const historyVersion = useRef(0);
  const workspaceScroll = useRef<HTMLDivElement>(null);
  const workspacePreview = useRef<HTMLDivElement>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<BusinessSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitLock = useRef(false);
  const keyLock = useRef(false);
  const unresolvedRequest = useRef<SubmissionReceipt | null>(null);
  const selectionContext = useRef<string | null>(null);
  const selectedModels = models.filter(model => model.modality === kind);
  const selected = selectBusinessModel(models, kind, modelId);
  const promptLimit = selected?.dedicatedVideo?.cjkPromptMaxChars && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prompt) ? selected.dedicatedVideo.cjkPromptMaxChars : selected?.promptMaxChars ?? 12000;
  const approved = access?.account?.status === "approved";
  const receiptStorageKey = approved && access?.account ? `bw:business-receipt:${access.account.id}` : "";

  const saveReceipt = useCallback((receipt: SubmissionReceipt | null) => {
    const previousRequestId = unresolvedRequest.current?.requestId;
    unresolvedRequest.current = receipt;
    if (!receiptStorageKey) return;
    try {
      if (receipt) sessionStorage.setItem(receiptStorageKey, JSON.stringify({ requestId: receipt.requestId, expiresAt: receipt.expiresAt }));
      else if (JSON.parse(sessionStorage.getItem(receiptStorageKey) ?? "null")?.requestId === previousRequestId) {
        sessionStorage.removeItem(receiptStorageKey);
      }
    } catch { /* Browser storage may be unavailable. The server still keeps accepted jobs. */ }
  }, [receiptStorageKey]);

  useEffect(() => {
    if (!receiptStorageKey) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(receiptStorageKey) ?? "null") as SubmissionReceipt | null;
      if (typeof stored?.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(stored.requestId) || !Number.isFinite(stored.expiresAt)) return;
      unresolvedRequest.current = stored;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- recover the previous tab's in-flight acknowledgement
      setUncertain(true);
    } catch { /* A missing or invalid receipt does not prevent browsing saved jobs. */ }
  }, [receiptStorageKey]);

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

  const loadHistory = useCallback(async (reconcile = true, silent = false) => {
    if (historyLock.current) return;
    historyLock.current = true;
    const version = historyVersion.current;
    if (!silent) setHistoryLoading(true);
    try {
      const response = await fetch("/api/business/generations", { cache: "no-store", signal: AbortSignal.timeout(30000) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.generations)) { if (!silent) setError(businessError(t, data?.error?.code)); return; }
      if (version !== historyVersion.current) return;
      let nextJobs: BusinessGeneration[] = data.generations;
      setJobs(nextJobs);
      const receipt = unresolvedRequest.current;
      if (!submitLock.current && receipt) {
        let original = nextJobs.find(job => job.clientRequestId === receipt.requestId);
        let checked = Boolean(original);
        if (!original) {
          const result = await fetch(`/api/business/generations?clientRequestId=${encodeURIComponent(receipt.requestId)}`, {
            cache: "no-store", signal: AbortSignal.timeout(10_000),
          });
          if (result.ok) {
            const body = await result.json();
            checked = body.generation === null || body.generation?.clientRequestId === receipt.requestId;
            if (checked && body.generation) original = body.generation;
          }
        }
        if (version !== historyVersion.current || unresolvedRequest.current !== receipt) return;
        if (original && !nextJobs.some(job => job.clientRequestId === receipt.requestId)) {
          nextJobs = [original, ...nextJobs];
          setJobs(nextJobs);
        }
        if (original || checked && Date.now() >= receipt.expiresAt) {
          saveReceipt(null);
          setUncertain(false);
          if (original?.status === "failed") setError(businessError(t, original.errorCode));
          else if (original) setNotice(resultsCopy.submitted);
          else setNotice(resultsCopy.receiptNotFound);
        }
      }
      if (reconcile) {
        const updates = await Promise.allSettled(nextJobs.filter(isPending).slice(0, 12).map(async job => {
          const status = await fetch(`/api/business/generations/${encodeURIComponent(job.id)}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
          if (!status.ok) return job;
          const result = await status.json();
          return (result.generation?.id === job.id ? result.generation : job) as BusinessGeneration;
        }));
        if (version !== historyVersion.current) return;
        const replaced = new Map(updates.filter((item): item is PromiseFulfilledResult<BusinessGeneration> => item.status === "fulfilled").map(item => [item.value.id, item.value]));
        setJobs(current => current.map(job => replaced.get(job.id) ?? job));
      }
    } catch { if (!silent) setError(t.unavailable); }
    finally { historyLock.current = false; if (!silent) setHistoryLoading(false); }
  }, [resultsCopy.receiptNotFound, resultsCopy.submitted, saveReceipt, t]);

  const hasPendingJobs = jobs.some(isPending);
  useEffect(() => {
    if (!approved || (!hasPendingJobs && !uncertain)) return;
    const refreshPending = () => { if (document.visibilityState === "visible") void loadHistory(true, true); };
    const timer = window.setInterval(refreshPending, 5000);
    document.addEventListener("visibilitychange", refreshPending);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshPending);
    };
  }, [approved, hasPendingJobs, uncertain, loadHistory]);

  const loadPersonalAssets = useCallback(async () => {
    personalAssetsRequest.current?.abort();
    const controller = new AbortController();
    personalAssetsRequest.current = controller;
    setPersonalAssetsStatus("loading");
    try {
      const response = await fetch("/api/assets", { cache: "no-store", signal: controller.signal });
      const data = response.ok ? await response.json() : null;
      if (!Array.isArray(data?.assets)) throw new Error("assets_unavailable");
      if (controller.signal.aborted) return;
      setAssets(data.assets);
      setPersonalAssetsStatus("ready");
    } catch {
      if (!controller.signal.aborted) setPersonalAssetsStatus("unavailable");
    }
  }, []);
  useEffect(() => {
    if (!approved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the signed-in user's image library
    void loadPersonalAssets();
    return () => personalAssetsRequest.current?.abort();
  }, [approved, loadPersonalAssets]);

  useEffect(() => {
    if (!approved) return;
    const controller = new AbortController();
    void fetch("/api/business/credentials", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null).catch(() => null).then(data => {
        if (controller.signal.aborted) return;
        const key = data?.credential ?? null;
        setCredential(key); if (key?.label) setKeyLabel(key.label);
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the signed-in workspace's private history
    void loadHistory(false);
    if (access?.keyConfigured) void loadModels();
    return () => controller.abort();
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
  const resetSelection = useCallback(() => { setSize(""); setResolution(""); setAssetIds([]); setAudio(false); setApiKey(""); setVideoMode("freestyle"); setProviderAssets([]); setReferenceOrder([]); setOutputFormat("mp4"); setSeed(""); setImageCount(1); setImageQuality(""); setImageNegative(""); setImagePromptExtend(false); setImageBusinessAssets([]); setDedicatedOptions({ ...DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS }); setConfirmation(null); }, [setConfirmation, setApiKey]);
  const navigate = (nextKind: BusinessKind, nextModel: string, nextTab: BusinessStudioTab) => startTransition(() => router.push(businessStudioHref({ kind: nextKind, modelId: nextModel, tab: nextTab }), { scroll: false }));
  const setTab = (value: BusinessStudioTab) => navigate(kind, modelId || selected?.id || "", value);
  const chooseTab = (value: BusinessStudioTab) => { setConfirmation(null); setApiKey(""); setError(""); setNotice(""); setTab(value); };
  const chooseKind = (value: BusinessKind) => { resetSelection(); setApiKey(""); navigate(value, "", "create"); };
  const chooseModel = (value: string) => { const model = models.find(item => item.id === value); if (!model) return; resetSelection(); setSeconds(model.defaultSeconds ?? Math.min(model.maxSeconds ?? 5, Math.max(model.minSeconds ?? 2, 5))); navigate(model.modality, model.id, "create"); };
  const chooseVideoMode = (value: BusinessSeedanceMode) => {
    const capability = selected?.seedance;
    if (capability) {
      const refs = [...[...assetIds, ...imageBusinessAssets].map(() => ({ type: "image" as const })), ...providerAssets];
      const issue = seedanceReferenceIssue(capability, value, refs, true);
      if (issue) { setError(seedanceReferenceMessage(d, issue, seedanceReferenceLimits(capability, value))); return; }
    }
    setVideoMode(value); setConfirmation(null); setError("");
    if (value === "video-edit" || value === "video-extend") setSeconds(-1);
    else if (seconds === -1 && !providerAssets.some(asset => asset.type === "video")) setSeconds(selected?.defaultSeconds ?? 5);
  };
  const toggleLocalReference = (id: number) => { const exists = assetIds.includes(id); const key = `local:${id}`; if (!exists && videoMode === "freestyle") setVideoMode("subject-reference"); setAssetIds(current => exists ? current.filter(value => value !== id) : [...current, id]); setReferenceOrder(current => exists ? current.filter(value => value !== key) : [...current, key]); setConfirmation(null); setError(""); };
  const toggleProviderReference = (asset: BusinessProviderAsset) => { const exists = providerAssets.some(value => value.id === asset.id); const key = `provider:${asset.id}`; if (!exists && videoMode === "freestyle") setVideoMode("subject-reference"); setProviderAssets(current => exists ? current.filter(value => value.id !== asset.id) : [...current, asset]); setReferenceOrder(current => exists ? current.filter(value => value !== key) : [...current, key]); setConfirmation(null); setError(""); };
  const chooseDedicatedOptions = (value: BusinessDedicatedVideoOptions) => {
    if (value.mode !== dedicatedOptions.mode) {
      const capability = selected?.dedicatedVideo;
      if (capability?.supportsPersonalReferences) {
        const mode = value.mode === "freestyle" ? capability.capability : value.mode;
        if (assetIds.length + imageBusinessAssets.length > dedicatedImageLimit(mode, capability.maxReferenceImages)) {
          setError(d.referenceLimitError); return;
        }
      } else {
        setImageBusinessAssets([]);
      }
      if (selected?.dedicatedVideo?.family === "wan3.0") setAspect("");
    }
    setDedicatedOptions(value); setConfirmation(null); setError("");
  };
  const addWanPersonalReference = (asset: BusinessAsset): boolean => {
    const capability = selected?.dedicatedVideo;
    if (!capability?.supportsPersonalReferences || !Number.isSafeInteger(asset.id) || asset.id < 1 ||
      !["image/png", "image/jpeg", "image/webp"].includes(asset.contentType ?? "image/png") ||
      (asset.size !== undefined && Number(asset.size) > (capability.referenceImageRules?.maxBytes ?? 20 * 1024 * 1024))) return false;
    if (assetIds.includes(asset.id)) return true;
    const effectiveMode = dedicatedOptions.mode === "freestyle" ? capability.capability : dedicatedOptions.mode;
    const nextMode = effectiveMode === "text-to-video" && capability.modes.includes("subject-reference") ? "subject-reference" : effectiveMode;
    if (assetIds.length + imageBusinessAssets.length >= dedicatedImageLimit(nextMode, capability.maxReferenceImages)) {
      setError(d.referenceLimitError); return false;
    }
    const key = `local:${asset.id}`;
    setAssets(current => current.some(item => item.id === asset.id) ? current : [...current, asset]);
    setAssetIds(current => current.includes(asset.id) ? current : [...current, asset.id]);
    setReferenceOrder(current => current.includes(key) ? current : [...current, key]);
    if (nextMode !== effectiveMode) setDedicatedOptions(current => ({ ...current, mode: nextMode }));
    setConfirmation(null); setError("");
    return true;
  };
  const removeDedicatedReference = (key: string) => {
    if (key.startsWith("local:")) setAssetIds(current => current.filter(id => `local:${id}` !== key));
    if (key.startsWith("business:")) setImageBusinessAssets(current => current.filter(asset => `business:${asset.uploadId}` !== key));
    setReferenceOrder(current => current.filter(value => value !== key));
    setConfirmation(null); setError("");
  };
  const toggleWanPersonalReference = (id: number) => {
    if (assetIds.includes(id)) { removeDedicatedReference(`local:${id}`); return; }
    const asset = assets.find(item => item.id === id);
    if (asset) addWanPersonalReference(asset);
  };
  const selectManagedAsset = (asset: BusinessAssetRecord) => {
    if (!selected) return;
    if (kind === "video" && selected.seedance) {
      if (asset.status !== "active") return;
      const next = providerAssets.some(value => value.id === asset.id) ? providerAssets.filter(value => value.id !== asset.id) : [...providerAssets, asset];
      if (next.length > providerAssets.length) {
        const nextMode = videoMode === "freestyle" || videoMode === "text-to-video" ? "subject-reference" : videoMode;
        const refs = [...[...assetIds, ...imageBusinessAssets].map(() => ({ type: "image" as const })), ...next];
        const issue = seedanceReferenceIssue(selected.seedance, nextMode, refs, true);
        if (issue) { setError(seedanceReferenceMessage(d, issue, seedanceReferenceLimits(selected.seedance, nextMode))); return; }
        setVideoMode(nextMode);
      }
      toggleProviderReference(asset); chooseTab("create");
    } else if ((kind === "image" || kind === "video" && selected.dedicatedVideo) && asset.type === "image" && asset.uploadId && asset.storageReady) {
      const next = imageBusinessAssets.some(value => value.uploadId === asset.uploadId) ? imageBusinessAssets.filter(value => value.uploadId !== asset.uploadId) : [...imageBusinessAssets, asset];
      const useMulti = selected.dedicatedVideo?.family === "wan3.0" && (dedicatedOptions.mode === "freestyle" || dedicatedOptions.mode === "text-to-video");
      const mode = useMulti ? "subject-reference" : dedicatedOptions.mode === "freestyle" ? selected.dedicatedVideo?.capability : dedicatedOptions.mode;
      const limit = selected.dedicatedVideo ? dedicatedImageLimit(mode, selected.dedicatedVideo.maxReferenceImages) : selected.maxReferenceImages ?? 4;
      if (next.length + assetIds.length > limit) { setError(d.referenceLimitError); return; }
      if (useMulti && next.length > imageBusinessAssets.length) setDedicatedOptions(current => ({ ...current, mode: "subject-reference" }));
      if (selected.dedicatedVideo?.supportsPersonalReferences) {
        const key = `business:${asset.uploadId}`;
        const adding = next.length > imageBusinessAssets.length;
        setReferenceOrder(current => adding ? [...current.filter(value => value !== key), key] : current.filter(value => value !== key));
      }
      setImageBusinessAssets(next); setConfirmation(null); chooseTab("create");
    }
  };
  useEffect(() => {
    const next = `${kind}:${selected?.id ?? modelId}`;
    if (restoredContext.current === next) {
      restoredContext.current = null;
    } else if (selectionContext.current !== null && selectionContext.current !== next) {
      resetSelection();
    }
    selectionContext.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- discard unsaved secrets when navigating between workspace panels
    setApiKey("");
  }, [kind, modelId, selected?.id, tab, resetSelection]);
  function pickMention(candidate: MentionCandidate): string | null {
    if (navigationPending || !selected?.supportsReferences) return null;
    const existing = candidate.localId ? assetIds.includes(candidate.localId) : selected.seedance && candidate.key.startsWith("provider:") ? providerAssets.some(asset => asset.id === candidate.asset?.id) : imageBusinessAssets.some(asset => asset.uploadId === candidate.asset?.uploadId);
    if (!existing) {
      const useMulti = selected.seedance && (videoMode === "freestyle" || videoMode === "text-to-video") || selected.dedicatedVideo?.family === "wan3.0" && (dedicatedOptions.mode === "freestyle" || dedicatedOptions.mode === "text-to-video");
      if (selected.seedance) {
        const mode = useMulti ? "subject-reference" : videoMode;
        const images = Array.from({ length: assetIds.length + imageBusinessAssets.length + 1 }, () => ({ type: "image" as const }));
        const issue = seedanceReferenceIssue(selected.seedance, mode, [...images, ...providerAssets], true);
        if (issue) { setError(seedanceReferenceMessage(d, issue, seedanceReferenceLimits(selected.seedance, mode))); return null; }
      } else {
        const mode = useMulti ? "subject-reference" : dedicatedOptions.mode === "freestyle" ? selected.dedicatedVideo?.capability : dedicatedOptions.mode;
        const limit = mode === "text-to-video" ? 0 : mode === "image-to-video" ? 1 : mode === "first-last-frame" ? 2 : selected.maxReferenceImages ?? 0;
        if (assetIds.length + imageBusinessAssets.length >= limit) { setError(mentionCopy.limit); return null; }
      }
      if (candidate.localId) {
        if (selected.dedicatedVideo) {
          if (!candidate.personalAsset || !addWanPersonalReference(candidate.personalAsset)) return null;
        } else {
          setAssetIds(current => [...current, candidate.localId!]);
          if (selected.seedance) setReferenceOrder(current => [...current, candidate.key]);
        }
      } else if (candidate.asset && selected.seedance && candidate.key.startsWith("provider:") && candidate.asset.status === "active") {
        setProviderAssets(current => [...current, candidate.asset!]); setReferenceOrder(current => [...current, candidate.key]);
      } else if (candidate.asset?.storageReady && candidate.asset.uploadId && (kind === "image" || selected.dedicatedVideo || selected.seedance)) {
        setImageBusinessAssets(current => [...current, candidate.asset!]);
        if (selected.seedance || selected.dedicatedVideo?.supportsPersonalReferences) setReferenceOrder(current => [...current, candidate.key]);
      } else return null;
      if (useMulti) {
        if (selected.seedance) setVideoMode("subject-reference");
        else if (!candidate.localId) setDedicatedOptions(current => ({ ...current, mode: "subject-reference" }));
      }
    }
    const tag = allocateMention({ key: candidate.key, name: candidate.name, type: "image" }, mentionBindings.current);
    mentionBindings.current[tag] = candidate.key;
    setConfirmation(null); setError("");
    return tag;
  }
  const requestConfirmation = (event: React.FormEvent) => {
    event.preventDefault(); if (submitLock.current || unresolvedRequest.current || navigationPending || uncertain || !selected || !prompt.trim()) return;
    const wan3 = selected.dedicatedVideo?.family === "wan3.0";
    const wanPersonal = selected.dedicatedVideo?.supportsPersonalReferences === true;
    if (prompt.length > (selected.promptMaxChars ?? 12000)) { setError(wan3 ? dedicatedCopy.wan3PromptLimit : klingText.promptLimit); return; }
    if (!selected.seedance && assetIds.length + (kind === "image" || selected.dedicatedVideo ? imageBusinessAssets.length : 0) > (selected.maxReferenceImages ?? 4)) { setError(d.referenceLimitError); return; }
    if (selected.nsfw && !access?.adultVerified) { setError(t.ageRequired); return; }
    if (/\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/.test(prompt)) { setError(t.keyWarning); return; }
    const selectedReferences: MentionReference[] = [
      ...assetIds.map(id => ({ key: `local:${id}`, name: "", type: "image" as const })),
      ...imageBusinessAssets.map(asset => ({ key: `business:${asset.uploadId}`, name: asset.name, type: "image" as const })),
      ...providerAssets.map(asset => ({ key: `provider:${asset.id}`, name: asset.name, type: asset.type })),
    ];
    const references = selected.seedance || wanPersonal ? orderMentionReferences(selectedReferences, referenceOrder) : selectedReferences;
    if (kind === "video" && selected.seedance) {
      const issue = seedanceReferenceIssue(selected.seedance, videoMode, references);
      if (issue) { setError(seedanceReferenceMessage(d, issue, seedanceReferenceLimits(selected.seedance, videoMode))); return; }
    }
    let resolvedPrompt: string;
    try { resolvedPrompt = resolveMentionPrompt(prompt.trim(), mentionBindings.current, references, wan3 ? (_type, index) => `Image ${index}` : undefined); }
    catch { setError(mentionCopy.missing); return; }
    if (kind === "video" && (selected.seedance || wan3)) {
      const counts = { image: 0, video: 0, audio: 0 };
      references.forEach(reference => { counts[reference.type]++; });
      // Imported prompts often use the provider's numbered syntax directly.
      // Never send those prompts with fewer references than they name.
      const indexed = wan3
        ? /\b(?:reference\s+)?(image|video|audio)\s+#?\s*(\d{1,3})\b|(?:@|參考|参考)(圖片|图片|圖|图|画像|影片|视频|動画|音訊|音频|音声)\s*#?\s*(\d{1,3})\b/giu
        : /\breference\s+(image|video|audio)\s*#?\s*(\d{1,3})\b|(?:@|參考|参考)(圖片|图片|圖|图|画像|影片|视频|動画|音訊|音频|音声)\s*#?\s*(\d{1,3})\b/giu;
      for (const match of resolvedPrompt.matchAll(indexed)) {
        const type = match[1]?.toLowerCase() as keyof typeof counts | undefined;
        const localized = /^(影片|视频|動画)$/.test(match[3]) ? "video" : /^(音訊|音频|音声)$/.test(match[3]) ? "audio" : "image";
        const index = Number(match[2] ?? match[4]);
        if (index < 1 || index > counts[type ?? localized]) { setError(resultsCopy.reuseReferenceRequired); return; }
      }
    }
    if (resolvedPrompt.length > promptLimit) { setError(wan3 ? dedicatedCopy.wan3PromptLimit : t.invalidRequest); return; }
    const parameters: BusinessSubmission["parameters"] = { model: selected.id, prompt: resolvedPrompt };
    if (kind === "image") {
      if (!Number.isSafeInteger(imageCount) || imageCount < 1 || imageCount > (selected.maxImageCount ?? 1)) { setError(t.invalidRequest); return; }
      parameters.n = imageCount; const outputSize = size || selected.sizes?.[0]; if (outputSize) parameters.size = outputSize;
      if (imageQuality && selected.imageControls?.some(control => control.key === "quality")) parameters.quality = imageQuality;
      if (imageNegative.trim() && selected.imageControls?.some(control => control.key === "negative_prompt")) parameters.negative_prompt = imageNegative.trim();
      if (seed.trim() && selected.imageControls?.some(control => control.key === "seed")) { const value = Number(seed); if (!Number.isSafeInteger(value) || value < -1 || value > 2147483647) { setError(t.invalidRequest); return; } parameters.seed = value; }
      if (imageBusinessAssets.length) parameters.businessAssetIds = imageBusinessAssets.map(asset => asset.uploadId!);
      if (selected.zImage) {
        parameters.prompt_extend = imagePromptExtend;
        try { buildBusinessZImagePayload(parameters, references.length); }
        catch { setError(t.invalidRequest); return; }
      }
    }
    if (kind === "video") {
      parameters.seconds = wan3 ? selectedSeconds : selected.secondsOptions?.length && !selected.secondsOptions.includes(seconds) ? selected.defaultSeconds ?? selected.secondsOptions[0] : Math.max(selected.minSeconds ?? 2, Math.min(seconds, selected.maxSeconds ?? 30));
      parameters.resolution = wan3 ? selectedResolution : resolution || selected.dedicatedVideo?.defaultResolution || selected.resolutions?.[0];
      const outputAspect = wan3 ? selectedAspect : selected.aspectRatios?.includes(aspect) ? aspect : selected.aspectRatios?.[0];
      if (outputAspect) parameters.aspect_ratio = outputAspect;
      if (selected.supportsAudio) parameters.generate_audio = selected.nativeAudioOnly || (!selected.nativeAudioResolutions || selected.nativeAudioResolutions.includes(parameters.resolution ?? "")) && audio;
    }
    if (kind === "text") parameters.max_tokens = 1024;
    if (selected.supportsReferences && assetIds.length) parameters.assetIds = [...assetIds];
    if (kind === "video" && selected.seedance) {
      parameters.mode = videoMode;
      parameters.seconds = seconds === -1 || providerAssets.some(asset => asset.type === "video") || videoMode === "video-edit" || videoMode === "video-extend" ? -1 : parameters.seconds;
      if (selected.seedance.version === "2.5" && ["image-to-video", "first-last-frame", "video-edit", "video-extend"].includes(videoMode)) parameters.aspect_ratio = "adaptive";
      if (providerAssets.length) parameters.providerAssets = providerAssets.map(({ id, type }) => ({ id, type }));
      if (imageBusinessAssets.length) parameters.businessAssetIds = imageBusinessAssets.map(asset => asset.uploadId!);
      if (references.length) parameters.referenceOrder = references.map(reference => reference.key);
      if (selected.seedance.version === "2.5") parameters.output_format = outputFormat;
      if (seed.trim()) { const value = Number(seed); if (!Number.isSafeInteger(value) || value < -1 || value > 2147483647) { setError(t.invalidRequest); return; } parameters.seed = value; }
      try {
        // Validate the same scalar/mode contract as the server before opening
        // paid confirmation. Placeholder URLs never read or transmit media.
        const adapterParameters = { ...parameters };
        delete adapterParameters.businessAssetIds;
        buildBusinessSeedancePayload(adapterParameters, references.map((reference, index) => ({ type: reference.type, url: `owned-reference-${index}` })));
      } catch { setError(t.invalidRequest); return; }
    }
    if (kind === "video" && selected.dedicatedVideo) {
      // Only reviewed Wan contracts accept owned personal IDs. Seedance's
      // provider asset handles are never accepted by dedicated video models.
      if ((!wanPersonal && (assetIds.length || referenceOrder.length)) || providerAssets.length ||
        imageBusinessAssets.some(asset => asset.type !== "image" || !asset.uploadId || (wanPersonal && !asset.storageReady))) { setError(t.invalidRequest); return; }
      parameters.mode = dedicatedOptions.mode === "freestyle" ? selected.dedicatedVideo.capability : dedicatedOptions.mode;
      const wan22 = selected.dedicatedVideo.family === "wan2.2";
      if (!wan3 && !wan22) parameters.watermark = dedicatedOptions.watermark;
      if (imageBusinessAssets.length) parameters.businessAssetIds = imageBusinessAssets.map(asset => asset.uploadId!);
      if (wanPersonal && references.length) parameters.referenceOrder = references.map(reference => reference.key);
      if (dedicatedOptions.seed.trim()) { const value = Number(dedicatedOptions.seed); if (!Number.isSafeInteger(value)) { setError(t.invalidRequest); return; } parameters.seed = value; }
      if (wan3 || wan22 || selected.dedicatedVideo.family === "wan2.7") parameters.prompt_extend = dedicatedOptions.promptExtend;
      if (selected.dedicatedVideo.family === "wan2.7" && dedicatedOptions.negativePrompt.trim()) parameters.negative_prompt = dedicatedOptions.negativePrompt.trim();
      if (selected.dedicatedVideo.aspectRatioFromSource) delete parameters.aspect_ratio;
      try {
        const placeholders = references.map((_, index) => ({ type: "image" as const, url: `https://owned.invalid/reference-${index}.png` }));
        const adapterParameters = { ...parameters };
        delete adapterParameters.assetIds;
        delete adapterParameters.referenceOrder;
        if (wan3) buildBusinessWan3Payload(adapterParameters, placeholders);
        else buildBusinessDedicatedVideoPayload(adapterParameters, placeholders);
      }
      catch { setError(t.invalidRequest); return; }
    }
    const usedTags = new Set(Array.from(prompt.matchAll(/@([\p{L}\p{N}_-]+)/gu), match => match[1]));
    const editorMentions = Object.fromEntries(Object.entries(mentionBindings.current).filter(([tag, key]) =>
      usedTags.has(tag) && references.some(reference => reference.key === key)));
    setError(""); setConfirmation({ clientRequestId: crypto.randomUUID(), kind, parameters, ...(Object.keys(editorMentions).length ? { editor: { prompt: prompt.trim(), mentions: editorMentions } } : {}) });
  };
  const submitGeneration = async () => {
    if (submitLock.current || unresolvedRequest.current || !confirmation) return;
    const request = confirmation;
    submitLock.current = true;
    setConfirmation(null);
    setSubmitting(true); setError(""); setNotice("");
    saveReceipt({ requestId: request.clientRequestId, expiresAt: Date.now() + RECEIPT_EXPIRY });
    try {
      const response = await fetch("/api/business/generations", {
        method: "POST", headers: { ...REQUEST_HEADERS, Prefer: "respond-async" },
        body: JSON.stringify(request), signal: AbortSignal.timeout(SUBMISSION_TIMEOUT),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (!PRE_SUBMIT_ERRORS.has(data?.error?.code) && (response.status >= 500 || response.status === 408 || data?.error?.code === "outcome_unknown")) setUncertain(true);
        else { saveReceipt(null); setError(businessError(t, data?.error?.code)); }
        return;
      }
      const job = data?.generation as BusinessGeneration | undefined;
      if (!job?.id || job.clientRequestId !== request.clientRequestId) { setUncertain(true); return; }
      historyVersion.current++;
      setJobs(current => [job, ...current.filter(item => item.id !== job.id)]);
      setSelectedJobId(job.id);
      saveReceipt(null);
      setUncertain(false);
      if (job.status === "failed" || job.status === "unknown") setError(businessError(t, job.errorCode ?? "outcome_unknown"));
      else setNotice(resultsCopy.submitted);
    } catch { setUncertain(true); }
    finally { submitLock.current = false; setSubmitting(false); }
  };
  const selectedSize = selected?.sizes?.includes(size) ? size : selected?.sizes?.[0] ?? "";
  const [zWidth = "", zHeight = ""] = (size || selected?.zImage?.defaultSize || "").split("x");
  const wan3Capability = selected?.dedicatedVideo?.family === "wan3.0" ? selected.dedicatedVideo : undefined;
  const dedicatedMode = dedicatedOptions.mode === "freestyle" ? selected?.dedicatedVideo?.capability : dedicatedOptions.mode;
  const wan3Text = wan3Capability && dedicatedMode === "text-to-video";
  const aspectOptions = wan3Text ? selected?.aspectRatios?.filter(value => value !== "adaptive") : selected?.aspectRatios;
  const defaultAspect = wan3Capability && (dedicatedMode === "image-to-video" || dedicatedMode === "first-last-frame") ? "adaptive" : aspectOptions?.[0] ?? "";
  const selectedResolution = selected?.resolutions?.includes(resolution) ? resolution : selected?.dedicatedVideo?.defaultResolution ?? selected?.resolutions?.[0] ?? "";
  const seedanceAdaptive = selected?.seedance?.version === "2.5" && ["image-to-video", "first-last-frame", "video-edit", "video-extend"].includes(videoMode);
  const seedanceVideoDuration = !!selected?.seedance && (providerAssets.some(asset => asset.type === "video") || videoMode === "video-edit" || videoMode === "video-extend");
  const seedanceAutoDuration = !!selected?.seedance && (seconds === -1 || seedanceVideoDuration);
  const selectedAspect = seedanceAdaptive ? "adaptive" : aspectOptions?.includes(aspect) ? aspect : defaultAspect;
  const selectedSeconds = wan3Capability
    ? seconds === -1 || (Number.isSafeInteger(seconds) && seconds >= wan3Capability.minSeconds && seconds <= wan3Capability.maxSeconds) ? seconds : wan3Capability.defaultSeconds
    : seedanceAutoDuration ? -1 : selected?.secondsOptions?.length && !selected.secondsOptions.includes(seconds) ? selected.defaultSeconds ?? selected.secondsOptions[0] : Math.max(selected?.minSeconds ?? 2, Math.min(seconds, selected?.maxSeconds ?? 30));
  const supportsAudioAtResolution = !selected?.nativeAudioResolutions || selected.nativeAudioResolutions.includes(selectedResolution);
  const referenceLimit = selected?.seedance?.references.image ?? selected?.maxReferenceImages ?? 4;
  const selectedReferenceKeys = new Set([
    ...assetIds.map(id => `local:${id}`),
    ...imageBusinessAssets.map(asset => `business:${asset.uploadId}`),
    ...providerAssets.map(asset => `provider:${asset.id}`),
  ]);
  const wanPersonal = selected?.dedicatedVideo?.supportsPersonalReferences === true;
  const personalMaxBytes = selected?.dedicatedVideo?.referenceImageRules?.maxBytes ?? 20 * 1024 * 1024;
  const dedicatedReferenceItems = wanPersonal ? orderMentionReferences([
    ...assetIds.map(id => ({ key: `local:${id}`, name: assets.find(asset => asset.id === id)?.name ?? t.references, src: `/api/assets/${id}/raw`, source: "personal" as const })),
    ...imageBusinessAssets.flatMap(asset => asset.uploadId ? [{ key: `business:${asset.uploadId}`, name: asset.name, src: `/api/business/provider-assets/uploads/${asset.uploadId}/preview`, source: "business" as const }] : []),
  ], referenceOrder) : [];
  const moveDedicatedReference = (key: string, direction: -1 | 1) => {
    const keys = dedicatedReferenceItems.map(item => item.key);
    const index = keys.indexOf(key), destination = index + direction;
    if (index < 0 || destination < 0 || destination >= keys.length) return;
    [keys[index], keys[destination]] = [keys[destination], keys[index]];
    setReferenceOrder(keys); setConfirmation(null);
  };
  const confirmationReferences = confirmation ? orderMentionReferences([
    ...(confirmation.parameters.assetIds ?? []).map(id => ({ key: `local:${id}`, name: assets.find(asset => asset.id === id)?.name ?? t.references, type: "image" as const })),
    ...(confirmation.parameters.businessAssetIds ?? []).map(id => ({ key: `business:${id}`, name: imageBusinessAssets.find(asset => asset.uploadId === id)?.name ?? t.references, type: "image" as const })),
    ...(confirmation.parameters.providerAssets ?? []).map(({ id, type }) => ({ key: `provider:${id}`, name: providerAssets.find(asset => asset.id === id)?.name ?? t.references, type })),
  ], confirmation.parameters.referenceOrder ?? []) : [];
  const visibleJobs = jobs.filter(job => job.kind === kind && (!job.nsfw || selected?.nsfw));
  const syncUpdatedJob = (job: BusinessGeneration) => {
    historyVersion.current++;
    setJobs(current => current.map(old => old.id === job.id ? job : old));
  };
  const previewJob = visibleJobs.find(job => job.id === selectedJobId) ?? visibleJobs[0];
  const restorePrompt = (job: BusinessGeneration, setup: BusinessReuseSetup | null) => {
    const model = models.find(item => item.id === job.model && item.modality === job.kind);
    if (!model) { setError(resultsCopy.missingModel); return; }
    resetSelection(); mentionBindings.current = {};
    setPromptOnly(null);
    setPrompt(setup?.editor?.prompt ?? job.prompt); setSelectedJobId(job.id);
    const p = setup?.parameters;
    if (setup && p) {
      mentionBindings.current = setup.editor?.mentions ?? {};
      const restoredLocal = setup.references.flatMap(reference => reference.source === "local" && reference.asset ? [reference.asset] : []);
      if (restoredLocal.length) setAssets(current => [...new Map([...current, ...restoredLocal].map(asset => [asset.id, asset])).values()]);
      setAssetIds(setup.references.flatMap(reference => reference.source === "local" ? [reference.id] : []));
      setProviderAssets(setup.references.flatMap(reference => reference.source === "provider" ? [reference.asset] : []));
      setImageBusinessAssets(setup.references.flatMap(reference => reference.source === "upload" ? [reference.asset] : []));
      if (model.seedance || model.dedicatedVideo?.supportsPersonalReferences) setReferenceOrder(setup.references.map(reference => reference.key));
      if (typeof p.size === "string") setSize(p.size);
      if (typeof p.n === "number") setImageCount(p.n);
      if (typeof p.quality === "string") setImageQuality(p.quality);
      if (typeof p.negative_prompt === "string" && job.kind === "image") setImageNegative(p.negative_prompt);
      if (model.zImage) setImagePromptExtend(p.prompt_extend === true);
      if (typeof p.seed === "number") setSeed(String(p.seed));
      if (typeof p.resolution === "string") setResolution(p.resolution);
      if (typeof p.seconds === "number") setSeconds(p.seconds);
      if (typeof p.aspect_ratio === "string") setAspect(p.aspect_ratio);
      if (typeof p.generate_audio === "boolean") setAudio(p.generate_audio);
      if (p.output_format === "mp4" || p.output_format === "mov") setOutputFormat(p.output_format);
      if (model.seedance?.modes.includes(p.mode as BusinessSeedanceMode)) setVideoMode(p.mode as BusinessSeedanceMode);
      if (model.dedicatedVideo) setDedicatedOptions({
        mode: model.dedicatedVideo.modes.includes(p.mode as BusinessSeedanceMode) ? p.mode as BusinessSeedanceMode : "freestyle",
        seed: typeof p.seed === "number" ? String(p.seed) : "",
        watermark: p.watermark === true,
        promptExtend: p.prompt_extend === true,
        negativePrompt: typeof p.negative_prompt === "string" ? p.negative_prompt : "",
      });
    } else {
      setSeconds(model.defaultSeconds ?? 5);
      setAspect("16:9");
    }
    restoredContext.current = selectionContext.current === `${job.kind}:${job.model}` ? null : `${job.kind}:${job.model}`;
    setError(""); setNotice(setup ? resultsCopy.reused : resultsCopy.reuseTextLoaded);
    navigate(job.kind, job.model, "create");
  };
  useEffect(() => () => { reuseRequest.current?.abort(); }, [kind, modelId, tab, credential?.id]);
  const reusePrompt = async (job: BusinessGeneration) => {
    if (reuseRequest.current) return;
    if (!models.some(model => model.id === job.model && model.modality === job.kind)) { setError(resultsCopy.missingModel); return; }
    const request = new AbortController();
    reuseRequest.current = request;
    setReuseLoading(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/business/generations/${encodeURIComponent(job.id)}/reuse`, { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(58000)]) });
      if (!response.ok) throw new Error("reuse_failed");
      const { reuse } = await response.json() as { reuse: BusinessReuseSetup | null };
      if (request.signal.aborted) return;
      const missing = !!reuse && (reuse.missingReferences > 0 || reuse.references.some(reference => reference.source === "generated"));
      if (!reuse || missing) setPromptOnly({ job, missing });
      else restorePrompt(job, reuse);
    } catch {
      if (!request.signal.aborted) setError(resultsCopy.reuseFailed);
    } finally {
      reuseRequest.current = null;
      setReuseLoading(false);
    }
  };
  useEffect(() => { workspaceScroll.current?.scrollTo({ top: 0, behavior: "instant" }); }, [tab, kind]);
  const dateLabel = (date: string) => { const parsed = new Date(date); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed); };

  const title = tab === "create" ? (kind === "image" ? s.imageTitle : kind === "video" ? s.videoTitle : s.textTitle) : tab === "key" ? operations.keys : tab === "assets" ? operations.assetTitle : tab === "usage" ? operations.usage : tab === "models" ? operations.models : tab === "workflows" ? workflowsCopy.nav : operations.work;
  return <div className={studio.shell} data-business-workspace>
    <BusinessStudioNav copy={s} business={t} approved={approved} keyConfigured={!!access?.keyConfigured} modelsLoading={modelsLoading} models={models} kind={kind} selectedId={selected?.id ?? ""} tab={tab} onKind={chooseKind} onModel={chooseModel} onTab={chooseTab} />
    <div className={studio.body}>
    {approved && <header className={studio.workspaceHeader}><div className={studio.workspaceHeaderInner}>
      <div><h1>{title}</h1>{access.account?.companyName && <p>{access.account.companyName}</p>}</div>
      {tab === "create" && (previewJob
        ? <button className={styles.small} type="button" aria-controls="business-preview" onClick={() => { workspacePreview.current?.focus({ preventScroll: true }); workspacePreview.current?.scrollIntoView({ block: "start", behavior: "instant" }); }}>{s.previewTitle}</button>
        : <button className={studio.keyStatus} data-connected={access.keyConfigured} type="button" onClick={() => chooseTab("key")}>{access.keyConfigured ? s.keyConnected : t.keyTab}</button>)}
    </div></header>}
    <div className={studio.workspaceBody} ref={workspaceScroll}>
    <div className={approved ? studio.activeContent : studio.entry}>
    {!approved && <><h1>{t.workspace}</h1><p>{t.description}</p></>}
    {error ? <p role="alert" className={styles.feedback}>{error}</p> : null}{notice || reuseLoading || submitting ? <p role="status" className={styles.success}>{submitting ? resultsCopy.registering : reuseLoading ? resultsCopy.reuseLoading : notice}</p> : null}
    {auth === "loading" ? <p className={styles.description} role="status">{t.loading}</p> : auth === "signedOut" ? <section className={styles.panel}><div className={styles.row}><Link href={`/login?next=${encodeURIComponent(businessStudioHref({ kind, modelId, tab }))}`} className={styles.button}>{t.login}</Link></div></section> : auth === "unverified" ? <p className={styles.warning}>{t.verifyEmail}</p> : !access ? <section className={styles.panel}><button className={styles.secondary} onClick={refresh} disabled={loading}>{loading ? t.checking : t.refresh}</button></section> : !approved ? <section className={styles.panel}>
      <div className={styles.panelHead}><div><h2 className={styles.heading}>{t.applyTitle}</h2><p className={styles.description}>{t.applyText}</p></div><button type="button" className={styles.small} onClick={refresh} disabled={loading}>{loading ? t.checking : t.refresh}</button></div>
      {access.account ? <div className={styles.stateCard}><span className={styles.status}>{t[access.account.status]}</span><p>{access.account.status === "pending" ? t.pendingText : access.account.status === "rejected" ? t.rejectedText : t.suspendedText}</p>{access.account.reviewNote ? <p className={styles.review}><strong>{t.reviewNote}</strong><br />{access.account.reviewNote}</p> : null}</div> : null}
      {access.account?.status !== "suspended" ? <form className={styles.form} onSubmit={apply}><label className={styles.field}>{t.company}<input required minLength={1} maxLength={120} value={company} onChange={e => setCompany(e.target.value)} placeholder={t.companyPlaceholder} autoComplete="organization" /></label><label className={styles.field}>{t.useCase}<textarea required minLength={10} maxLength={2000} value={useCase} onChange={e => setUseCase(e.target.value)} placeholder={t.useCasePlaceholder} /></label><div><button type="submit" className={styles.button} disabled={applying}>{applying ? t.applying : access.account ? t.reapply : t.apply}</button></div></form> : null}
    </section> : <>
      <section id={`business-panel-${tab}`} aria-label={tab === "create" ? t.createTab : tab === "key" ? t.keyTab : tab === "workflows" ? workflowsCopy.nav : tab === "assets" ? operations.assets : tab === "usage" ? operations.usage : tab === "models" ? operations.models : t.historyTab} className={tab === "create" ? studio.createLayout : tab === "workflows" ? workflowStyles.workspacePanel : tab === "key" ? `${studio.section} ${studio.keyPanel}` : studio.section}>
        {tab === "workflows" ? <BusinessWorkflows models={models} /> : tab === "assets" ? <BusinessAssets imageOnly={kind === "image" || !!selected?.dedicatedVideo} onSelect={(selected?.seedance || ((kind === "image" || !!selected?.dedicatedVideo) && selected?.supportsReferences)) ? selectManagedAsset : undefined} selectedIds={kind === "image" || selected?.dedicatedVideo ? imageBusinessAssets.map(asset => asset.uploadId ?? asset.id) : providerAssets.map(asset => asset.id)} /> : tab === "usage" ? <BusinessUsage /> : tab === "models" ? <BusinessModelCatalog models={models} unavailableModels={unavailableModels} upstreamTotal={upstreamTotal} loading={modelsLoading} onRefresh={() => void loadModels()} onChoose={chooseModel} /> : tab === "key" ? <><p className={styles.description}>{t.keyText}</p>{credential ? <div className={styles.keyCard}><div><strong>{credential.label}</strong><p>{t.configured} · {t.last4} •••• {credential.last4}</p><p>{dateLabel(credential.updatedAt)}</p></div><button className={styles.small} type="button" onClick={() => setDeleteOpen(true)} disabled={keySaving}>{t.deleteKey}</button></div> : <p className={styles.note}>{t.notConfigured}</p>}
          {!access.encryptionReady ? <p className={styles.warning}>{t.encryptionUnavailable}</p> : null}<form className={styles.form} onSubmit={saveKey} autoComplete="off"><label className={styles.field}>{t.keyLabel}<input value={keyLabel} onChange={e => setKeyLabel(e.target.value)} maxLength={64} required autoComplete="off" /></label><label className={styles.field}>{t.apiKey}<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} required placeholder={t.keyPlaceholder} maxLength={203} autoComplete="new-password" spellCheck={false} autoCapitalize="none" aria-describedby="business-key-privacy" /></label><p id="business-key-privacy" className={styles.note}>{t.writeOnly}</p><div><button type="submit" className={styles.button} disabled={keySaving || !access.encryptionReady || !apiKey.trim()}>{keySaving ? t.saving : credential ? t.replaceKey : t.saveKey}</button></div></form></> : tab === "create" ? <><div className={studio.editor}>
          {!access.keyConfigured ? <div className={styles.empty}><h2>{t.keyTab}</h2><p>{t.keyNeeded}</p><button className={styles.button} type="button" onClick={() => chooseTab("key")}>{t.keyTab}</button></div> : <><div className={studio.editorHeader}><h2>{s.parametersTitle}</h2>{!modelsLoading && !selectedModels.length && <button className={styles.small} type="button" onClick={loadModels}>{t.refresh}</button>}</div><form className={studio.editorForm} onSubmit={requestConfirmation}>
            <label className={styles.field}>{t.model}<select required value={selected?.id ?? ""} onChange={e => chooseModel(e.target.value)} disabled={modelsLoading || !selectedModels.length}>{!selected && <option value="" disabled>{modelId ? s.modelUnavailable : t.emptyModels}</option>}{selectedModels.map(model => <option key={model.id} value={model.id}>{model.displayName}{model.nsfw ? ` · ${t.nsfw}` : ""}</option>)}</select></label>
            {!modelsLoading && modelId && !selected && <p className={styles.warning} role="alert">{s.modelUnavailable}</p>}
            {selected?.nsfw ? <span className={styles.sensitive}>{t.nsfw}</span> : null}
            <BusinessPrompt value={prompt} onChange={setPrompt} maxLength={promptLimit} label={t.prompt} placeholder={t.promptPlaceholder} note={t.keyWarning} assets={assets} mode={!selected?.supportsReferences ? "none" : selected.seedance ? "seedance" : wanPersonal ? "native-with-personal" : selected.dedicatedVideo ? "native" : kind === "image" ? "image" : "local"} personalMaxBytes={wanPersonal ? personalMaxBytes : undefined} onPick={pickMention} selectedKeys={selectedReferenceKeys} />
            <div className={styles.settings}>{kind === "image" && selected?.zImage ? <>
              <label className={styles.field}>{operations.imageWidth}<input type="number" inputMode="numeric" min={selected.zImage.minDimension} max={selected.zImage.maxDimension} step={1} value={zWidth} required onChange={e => setSize(`${e.target.value}x${zHeight}`)} /></label>
              <label className={styles.field}>{operations.imageHeight}<input type="number" inputMode="numeric" min={selected.zImage.minDimension} max={selected.zImage.maxDimension} step={1} value={zHeight} required onChange={e => setSize(`${zWidth}x${e.target.value}`)} /></label>
            </> : kind === "image" && selected?.sizes?.length ? <label className={styles.field}>{t.size}<select value={selectedSize} onChange={e => setSize(e.target.value)}>{selected.sizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
              {kind === "video" ? <>
                <label className={styles.field}>{t.duration}
                  {wan3Capability ? <BusinessWan3DurationSelect capability={wan3Capability} seconds={selectedSeconds} onChange={setSeconds} /> : selected?.seedance ? <>
                    <select aria-label={t.duration} value={seedanceAutoDuration ? "auto" : "fixed"} disabled={seedanceVideoDuration} onChange={e => setSeconds(e.target.value === "auto" ? -1 : selected.defaultSeconds ?? 5)}><option value="fixed">{d.fixed}</option><option value="auto">{d.automatic}</option></select>
                    {!seedanceAutoDuration ? <input type="number" min={selected.minSeconds} max={selected.maxSeconds} step={1} value={selectedSeconds} required aria-label={t.duration} onChange={e => setSeconds(Number(e.target.value))} /> : <span className={styles.note}>{d.autoDurationNotice}</span>}
                  </> : selected?.secondsOptions?.length ? <select value={selectedSeconds} onChange={e => setSeconds(Number(e.target.value))}>{selected.secondsOptions.map(value => <option key={value} value={value}>{value}</option>)}</select> : <input type="number" min={selected?.minSeconds ?? 2} max={selected?.maxSeconds ?? 15} step={1} value={selectedSeconds} required onChange={e => setSeconds(Number(e.target.value))} />}
                </label>
                {selected?.resolutions?.length ? <label className={styles.field}>{t.resolution}<select value={selectedResolution} onChange={e => setResolution(e.target.value)}>{selected.resolutions.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
                {aspectOptions?.length ? <label className={styles.field}>{t.aspect}<select value={selected?.dedicatedVideo?.aspectRatioFromSource ? "source" : selectedAspect} disabled={seedanceAdaptive || selected?.dedicatedVideo?.aspectRatioFromSource} onChange={e => setAspect(e.target.value)}>{selected?.dedicatedVideo?.aspectRatioFromSource ? <option value="source">{dedicatedCopy.sourceAspect}</option> : aspectOptions.map(value => <option value={value} key={value}>{wan3Capability && value === "adaptive" ? dedicatedCopy.automaticAspect : value}</option>)}</select></label> : null}
              </> : null}
            </div>{kind === "image" && selected ? <BusinessImageControls model={selected} count={imageCount} onCount={setImageCount} quality={imageQuality} onQuality={setImageQuality} seed={seed} onSeed={setSeed} negative={imageNegative} onNegative={setImageNegative} /> : null}{kind === "video" && selected?.supportsAudio ? <label className={styles.check}><input type="checkbox" checked={selected.nativeAudioOnly || (supportsAudioAtResolution && audio)} disabled={selected.nativeAudioOnly || !supportsAudioAtResolution} onChange={e => setAudio(e.target.checked)} />{t.audio}</label> : null}
            {kind === "image" && selected?.zImage ? <div>
              <p className={styles.note}>{operations.textImageOnly}</p>
              <label className={styles.check}><input type="checkbox" checked={imagePromptExtend} onChange={e => setImagePromptExtend(e.target.checked)} aria-describedby={selected.zImage.promptExtendSurcharged ? "business-z-rewrite-cost" : undefined} />{operations.promptRewrite}</label>
              {selected.zImage.promptExtendSurcharged ? <p className={styles.note} id="business-z-rewrite-cost">{operations.promptRewriteSurcharge}</p> : null}
            </div> : null}
            {selected?.seedance ? <BusinessSeedanceControls key={credential?.id ?? "current-key"} capability={selected.seedance} mode={videoMode} onMode={chooseVideoMode} assets={assets} assetIds={assetIds} onLocalSelection={toggleLocalReference} providerAssets={providerAssets} nativeAssets={imageBusinessAssets} onNativeRemove={id => { setImageBusinessAssets(current => current.filter(asset => asset.uploadId !== id)); setReferenceOrder(current => current.filter(key => key !== `business:${id}`)); setConfirmation(null); }} onProviderSelection={toggleProviderReference} referenceOrder={referenceOrder} outputFormat={outputFormat} onOutputFormat={setOutputFormat} seed={seed} onSeed={setSeed} onOpenAssets={() => chooseTab("assets")} /> : null}
            {selected?.dedicatedVideo ? <>
              <BusinessDedicatedVideoControls
                capability={selected.dedicatedVideo}
                value={dedicatedOptions}
                onChange={chooseDedicatedOptions}
                referenceCount={imageBusinessAssets.length}
                onOpenAssets={() => chooseTab("assets")}
                personalLibrary={wanPersonal ? { assets, selectedIds: assetIds, onToggle: toggleWanPersonalReference, loading: personalAssetsStatus === "loading", unavailable: personalAssetsStatus === "unavailable", onRetry: () => void loadPersonalAssets() } : undefined}
                referenceItems={wanPersonal ? dedicatedReferenceItems : undefined}
                onRemoveReference={wanPersonal ? removeDedicatedReference : undefined}
                onMoveReference={wanPersonal ? moveDedicatedReference : undefined}
              />
              {!wanPersonal && imageBusinessAssets.length > 0 ? <div className={styles.row}>{imageBusinessAssets.map((asset, index) => <button key={asset.id} type="button" className={styles.small} onClick={() => { setImageBusinessAssets(current => current.filter(value => value.id !== asset.id)); setConfirmation(null); }}><span>{index + 1}. {asset.name} ×</span></button>)}</div> : null}
            </> : null}
            {seedanceAdaptive ? <p className={styles.note}>{d.adaptiveNotice}</p> : null}
            {kind === "image" && selected?.supportsReferences ? <div><button type="button" className={styles.small} onClick={() => chooseTab("assets")}>{operations.openAssets} ↗</button>{imageBusinessAssets.length > 0 && <div className={styles.row} style={{marginTop:12}}>{imageBusinessAssets.map(asset => <button key={asset.id} type="button" className={styles.small} onClick={() => setImageBusinessAssets(current => current.filter(value => value.id !== asset.id))}>{asset.name} ×</button>)}</div>}</div> : null}{selected?.supportsReferences && !selected.seedance && !selected.dedicatedVideo ? <details className={styles.promptDetails}><summary>{t.references} · {assetIds.length + (kind === "image" ? imageBusinessAssets.length : 0)} / {referenceLimit}</summary><p className={styles.note}>{t.referenceText.replace("{n}", String(referenceLimit))}</p>{assets.length ? <div className={styles.assetGrid}>{assets.slice(0, 100).map(asset => <button type="button" key={asset.id} className={styles.asset} aria-pressed={assetIds.includes(asset.id)} title={assetIds.includes(asset.id) ? t.removeReference : t.selectReference} disabled={!assetIds.includes(asset.id) && assetIds.length + (kind === "image" ? imageBusinessAssets.length : 0) >= referenceLimit} onClick={() => setAssetIds(current => current.includes(asset.id) ? current.filter(id => id !== asset.id) : [...current, asset.id])}><Image src={asset.src} alt={asset.name} loading="lazy" width={200} height={100} unoptimized /><span>{asset.name}</span></button>)}</div> : <p className={styles.note}>{t.noAssets}</p>}<button type="button" className={styles.small} onClick={() => chooseTab("assets")}>{operations.openAssets} ↗</button></details> : null}
            {selected?.id === "minimax-h3" || selected?.id === "minimax-h3-max" ? <p className={styles.warning}>{selected.id === "minimax-h3" ? t.minimaxH3References : t.minimaxH3MaxReferences}</p> : null}<div className={studio.reviewActions}><p className={styles.note}>{t.providerBilling} · {t.noCredits}</p><button type="submit" className={styles.button} disabled={submitting || navigationPending || uncertain || !selected || !prompt.trim() || (selected.nsfw && !access.adultVerified)}>{submitting ? t.generating : t.generate} <span aria-hidden="true">↗</span></button></div>
          </form>{selected?.nsfw && !access.adultVerified ? <BusinessAdultDeclaration copy={t} onVerified={refreshAccess} /> : null}</>}
        </div><div className={studio.preview} id="business-preview" tabIndex={-1} ref={workspacePreview}><BusinessStage movNotice={d.movNotice} copy={s} business={t} kind={kind} model={selected} key={previewJob?.id ?? kind} job={previewJob} recentJobs={visibleJobs} onSelect={job => setSelectedJobId(job.id)} onReuse={reusePrompt} onHistory={() => chooseTab("history")} onRefresh={() => void loadHistory(true)} refreshing={historyLoading} onJobUpdated={syncUpdatedJob} /></div></> : <BusinessCollection jobs={jobs} refreshing={historyLoading} onRefresh={() => void loadHistory(true)} onReuse={reusePrompt} onJobUpdated={syncUpdatedJob} />}
      </section>
      {uncertain ? <aside className={styles.warning} role="status">{t.uncertain}<div className={styles.row} style={{ marginTop: 12 }}><button type="button" className={styles.small} disabled={historyLoading} onClick={() => loadHistory(true)}>{historyLoading ? t.checking : t.checkOriginal}</button></div></aside> : null}
    </>}
    </div></div></div>
    {confirmation ? <BusinessDialog title={t.confirmTitle} busy={submitting} onClose={() => setConfirmation(null)}>
      <p>{t.confirmText}</p>
      <dl>
        <dt>{t.model}</dt><dd>{models.find(model => model.id === confirmation.parameters.model)?.displayName ?? confirmation.parameters.model}</dd>
        <dt>{t.providerBilling}</dt><dd>{t.noCredits}</dd>
        {credential ? <><dt>{t.last4}</dt><dd>•••• {credential.last4}</dd></> : null}
        {confirmation.parameters.mode ? <><dt>{d.mode}</dt><dd>{({ freestyle: d.freestyle, "text-to-video": d.textToVideo, "image-to-video": d.imageToVideo, "first-last-frame": d.firstLastFrame, "subject-reference": d.subjectReference, "video-edit": d.videoEdit, "video-extend": d.videoExtend })[confirmation.parameters.mode]}</dd></> : null}
        {confirmationReferences.length > 0 ? <><dt>{t.references} · {confirmationReferences.length}</dt><dd><ol className={styles.confirmationReferences}>{confirmationReferences.map(reference => <li key={reference.key}>{reference.name} <small>· {d[reference.type]}</small></li>)}</ol></dd></> : null}
        {confirmation.kind === "image" ? <><dt>{operations.imageCount}</dt><dd>{confirmation.parameters.n ?? 1} · {confirmation.parameters.size}{confirmation.parameters.quality ? ` · ${confirmation.parameters.quality}` : ""}</dd></> : null}
        {confirmation.kind === "video" ? <><dt>{t.duration}</dt><dd>{confirmation.parameters.seconds === -1 ? d.automatic : `${confirmation.parameters.seconds}s`} · {confirmation.parameters.resolution} · {confirmation.parameters.aspect_ratio ?? (models.find(model => model.id === confirmation.parameters.model)?.dedicatedVideo?.aspectRatioFromSource ? dedicatedCopy.sourceAspect : "")}{confirmation.parameters.output_format ? ` · ${confirmation.parameters.output_format.toUpperCase()}` : ""}</dd></> : null}
      </dl>
      <p className={styles.dialogPrompt}>{confirmation.editor?.prompt ?? confirmation.parameters.prompt}</p><p>{t.noQuote}</p>
      {confirmation.parameters.prompt_extend && models.some(model => model.id === confirmation.parameters.model && (model.zImage?.promptExtendSurcharged || model.dedicatedVideo?.promptExtendSurcharged)) ? <p className={styles.warning}>{operations.promptRewriteSurcharge}</p> : null}
      {confirmation.parameters.model === "minimax-h3" || confirmation.parameters.model === "minimax-h3-max" ? <p className={styles.warning}>{confirmation.parameters.model === "minimax-h3" ? t.minimaxH3References : t.minimaxH3MaxReferences}</p> : null}
      <p className={styles.note}>{t.billingNotice}</p>
      <div className={styles.dialogActions}><button className={styles.button} type="button" onClick={submitGeneration} disabled={submitting}>{submitting ? t.generating : t.confirm}</button><button className={styles.secondary} type="button" onClick={() => setConfirmation(null)} disabled={submitting}>{t.cancel}</button></div>
    </BusinessDialog> : null}
    {promptOnly ? <BusinessDialog title={resultsCopy.reuse} busy={false} onClose={() => setPromptOnly(null)}><p>{promptOnly.missing ? resultsCopy.reuseMissing : resultsCopy.reuseLegacy}</p><div className={styles.dialogActions}><button className={styles.button} type="button" onClick={() => restorePrompt(promptOnly.job, null)}>{resultsCopy.reuseTextOnly}</button><button className={styles.secondary} type="button" onClick={() => setPromptOnly(null)}>{t.cancel}</button></div></BusinessDialog> : null}
    {deleteOpen ? <BusinessDialog title={t.deleteTitle} busy={keySaving} onClose={() => setDeleteOpen(false)}><p>{t.deleteText}</p><div className={styles.dialogActions}><button className={styles.button} type="button" onClick={deleteKey} disabled={keySaving}>{keySaving ? t.saving : t.deleteKey}</button><button className={styles.secondary} type="button" onClick={() => setDeleteOpen(false)} disabled={keySaving}>{t.cancel}</button></div></BusinessDialog> : null}
  </div>;
}
