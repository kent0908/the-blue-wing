"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { draftLibraryCopy } from "@/lib/i18n/draftLibrary";
import { notifyCreditsUpdated } from "@/lib/creditEvents";
import { downloadResult } from "@/lib/download";

type JobStatus = "submitting" | "processing" | "completed" | "failed";
interface DraftRow {
  id: string | null;
  requestId: string;
  status: JobStatus;
  prompt: string;
  seconds: number;
  aspectRatio: string;
  generateAudio: boolean;
  url: string | null;
  createdAt: string;
  expiresAt: string | null;
  canFinalize: boolean;
  hasNativeTask: boolean;
  finalStatus: JobStatus | "unknown" | null;
  finalId: string | null;
  finalUrl: string | null;
  draftCredits: number;
  finalCredits: number | null;
  totalCredits: number | null;
}

interface FinalizeAttempt { id: string; uncertain: boolean; }
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const pending = (status: string | null) => status === "processing" || status === "submitting" || status === "unknown";
const storageKey = (requestId: string) => `bw:draft-finalize:v1:${requestId}`;

function savedAttempt(requestId: string): FinalizeAttempt | null {
  try {
    const attempt = JSON.parse(sessionStorage.getItem(storageKey(requestId)) || "null");
    return attempt && UUID.test(attempt.id) ? { id: attempt.id, uncertain: attempt.uncertain === true } : null;
  } catch { return null; }
}

function storeAttempt(requestId: string, attempt: FinalizeAttempt) {
  try { sessionStorage.setItem(storageKey(requestId), JSON.stringify(attempt)); } catch { /* The in-memory ID remains authoritative for this page. */ }
}

function isDraft(value: unknown): value is DraftRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DraftRow>;
  return typeof row.requestId === "string" && typeof row.prompt === "string" && typeof row.seconds === "number" &&
    typeof row.createdAt === "string" && typeof row.status === "string" && ["submitting", "processing", "completed", "failed"].includes(row.status);
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_response");
  return body as Record<string, unknown>;
}

export default function SeedanceDraftLibrary() {
  const locale = useLocale();
  const copy = draftLibraryCopy(locale);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginRequired, setLoginRequired] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<"success" | "uncertain" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyDraft, setBusyDraft] = useState<string | null>(null);
  const [uncertainRequests, setUncertainRequests] = useState<Set<string>>(new Set());
  const [playbackErrors, setPlaybackErrors] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<DraftRow | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const listAbort = useRef<AbortController | null>(null);
  const actionInFlight = useRef(false);
  const attempts = useRef(new Map<string, FinalizeAttempt>());

  const refresh = useCallback(async () => {
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
    try {
      const response = await fetch("/api/videos/drafts", { cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) {
        setLoginRequired(true); setDrafts([]); setLoadFailed(false); return;
      }
      if (!response.ok) throw new Error("draft_list_unavailable");
      const body = await jsonBody(response);
      if (!Array.isArray(body.drafts) || !body.drafts.every(isDraft)) throw new Error("invalid_response");
      let rows = body.drafts as DraftRow[];
      // Only GETs run during refresh. Pending jobs reconcile media and billing on the server.
      const jobs = new Set(rows.flatMap(row => [pending(row.status) ? row.id : null, pending(row.finalStatus) ? row.finalId : null]).filter((id): id is string => !!id));
      if (jobs.size) {
        const results = await Promise.allSettled([...jobs].map(async id => {
          const poll = await fetch(`/api/videos/${encodeURIComponent(id)}`, { cache: "no-store", signal });
          if (!poll.ok) return false;
          const json = await jsonBody(poll);
          return json.status === "completed" || json.status === "failed";
        }));
        if (results.some(result => result.status === "fulfilled" && result.value)) {
          const updated = await fetch("/api/videos/drafts", { cache: "no-store", signal });
          if (updated.ok) {
            const body = await jsonBody(updated);
            if (Array.isArray(body.drafts) && body.drafts.every(isDraft)) rows = body.drafts;
          }
          notifyCreditsUpdated();
        }
      }
      if (controller.signal.aborted) return;
      setDrafts(rows); setCheckedAt(Date.now()); setLoginRequired(false); setLoadFailed(false);
      const unknown = new Set<string>();
      for (const row of rows) {
        let stored = savedAttempt(row.requestId) ?? attempts.current.get(row.requestId);
        if (row.finalStatus === "failed") {
          // An explicitly failed server attempt may be retried by a fresh, paid user confirmation.
          attempts.current.delete(row.requestId);
          try { sessionStorage.removeItem(storageKey(row.requestId)); } catch { /* Optional storage. */ }
          stored = undefined;
        } else if (stored && row.finalStatus === null && row.canFinalize === true) {
          // The server confirms no final request was claimed. Keep the UUID; only a new click may resubmit it.
          stored = { ...stored, uncertain: false };
          attempts.current.set(row.requestId, stored); storeAttempt(row.requestId, stored);
        } else if (stored) attempts.current.set(row.requestId, stored);
        if (!row.finalId && (row.finalStatus === "unknown" || stored?.uncertain)) unknown.add(row.requestId);
      }
      setUncertainRequests(unknown);
      if (unknown.size === 0) setNotice(previous => previous === "uncertain" ? null : previous);
    } catch {
      if (!controller.signal.aborted) setLoadFailed(true);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const start = window.setTimeout(() => void refresh(), 0);
    return () => { window.clearTimeout(start); listAbort.current?.abort(); };
  }, [refresh]);
  const hasExpiry = drafts.some(row => !!row.expiresAt);
  useEffect(() => {
    if (!hasExpiry) return;
    const timer = window.setInterval(() => setCheckedAt(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [hasExpiry]);
  const needsPolling = drafts.some(row => pending(row.status) || pending(row.finalStatus)) || uncertainRequests.size > 0;
  useEffect(() => {
    if (!needsPolling) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 8_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [needsPolling, refresh]);

  function errorMessage(code: unknown): string {
    switch (code) {
      case "draft_expired": return copy.expiredError;
      case "stale_quote": return copy.staleQuote;
      case "insufficient_credits": return copy.insufficient;
      case "too_many_concurrent": return copy.concurrency;
      case "draft_not_ready": return copy.notReady;
      case "draft_not_found": return copy.missing;
      case "invalid_draft_request": return copy.invalid;
      case "draft_final_unknown": case "draft_final_mismatch": return copy.uncertain;
      default: return copy.unavailable;
    }
  }

  function openConfirmation(row: DraftRow) {
    if (!row.id || !row.canFinalize || busyDraft || uncertainRequests.has(row.requestId)) return;
    if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) { setActionError(copy.expiredError); void refresh(); return; }
    setActionError(null); setNotice(null); setSelected(row);
    dialog.current?.showModal();
  }

  async function finalize() {
    if (!selected?.id || !selected.canFinalize || actionInFlight.current || !Number.isSafeInteger(selected.finalCredits) || Number(selected.finalCredits) < 1) return;
    actionInFlight.current = true;
    const row = selected;
    setBusyDraft(row.requestId); setActionError(null); setNotice(null);
    let attempt = attempts.current.get(row.requestId) ?? savedAttempt(row.requestId);
    if (!attempt) attempt = { id: crypto.randomUUID(), uncertain: false };
    // Retain the ID before the network call; a lost response must never create a new paid request.
    attempts.current.set(row.requestId, attempt); storeAttempt(row.requestId, attempt);
    try {
      const response = await fetch(`/api/videos/drafts/${encodeURIComponent(row.id!)}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-blue-wing-expected-credits": String(row.finalCredits) },
        body: JSON.stringify({ clientRequestId: attempt.id }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = await jsonBody(response);
      if (!response.ok) {
        const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
        setActionError(errorMessage(error.code));
        if (response.status >= 500 || ["draft_final_unknown", "draft_final_mismatch"].includes(String(error.code))) throw new Error("uncertain_submission");
        if (response.status === 401 || response.status === 403) setLoginRequired(true);
        dialog.current?.close(); setSelected(null);
        return;
      }
      if (typeof body.id !== "string" || !body.id || !["processing", "completed"].includes(String(body.status))) throw new Error("uncertain_submission");
      const accepted = { ...attempt, uncertain: false };
      attempts.current.set(row.requestId, accepted); storeAttempt(row.requestId, accepted);
      setDrafts(previous => previous.map(draft => draft.requestId === row.requestId ? { ...draft, finalId: String(body.id), finalStatus: body.status as JobStatus, finalUrl: typeof body.url === "string" ? body.url : null, canFinalize: false } : draft));
      setUncertainRequests(previous => { const next = new Set(previous); next.delete(row.requestId); return next; });
      notifyCreditsUpdated(); setNotice("success");
      dialog.current?.close(); setSelected(null);
    } catch {
      const unknownAttempt = { ...attempt, uncertain: true };
      attempts.current.set(row.requestId, unknownAttempt); storeAttempt(row.requestId, unknownAttempt);
      setUncertainRequests(previous => new Set(previous).add(row.requestId));
      setNotice("uncertain"); setActionError(null);
      dialog.current?.close(); setSelected(null);
    } finally {
      actionInFlight.current = false; setBusyDraft(null); void refresh();
    }
  }

  const pointLabel = (value: number | null) => typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString(locale)} ${copy.points}` : copy.rateUnavailable;
  const dateLabel = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  const statusLabel = (status: JobStatus | "unknown" | null) => status ? copy[status] : copy.waiting;
  const createUrl = "/studio?mode=video&model=SIRAYA-Seedance-2.5&draft=1";

  return (
    <div className="h-full overflow-y-auto bg-[#0b1112] text-[#e4eae6]">
      <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-10 sm:py-14 lg:px-16">
        <header className="border-b border-[#344441] pb-9">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#abc2bb]">
            <Link href="/seedance-draft" className="min-h-9 content-center tracking-[0.12em] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4">{copy.workflow} ↗</Link>
            <button type="button" onClick={() => { setPlaybackErrors(new Set()); void refresh(); }} disabled={loading} className="min-h-10 rounded-full border border-[#40534d] px-4 transition-colors hover:bg-white/5 disabled:opacity-50 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4">{copy.refresh} ↻</button>
          </div>
          <h1 className="mt-9 max-w-4xl font-serif text-[clamp(2rem,5vw,4rem)] leading-[1.2] tracking-tight [text-wrap:balance]">{copy.title}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-[#a6bab3] [text-wrap:pretty]">{copy.introduction}</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={createUrl} className="min-h-11 content-center rounded-full bg-[#c9e3d8] px-5 text-sm text-[#19332d] hover:bg-[#e0f0e8] focus-visible:outline-2 focus-visible:outline-offset-4">{copy.create} ↗</Link>
            <p className="max-w-xl text-xs leading-6 text-[#819991] [text-wrap:pretty]">{copy.expiryNotice}</p>
          </div>
        </header>

        <div aria-live="polite" className="mt-5">
          {notice ? <p role="status" className="border-l-2 border-[#b5d8c8] bg-[#14221e] px-4 py-3 text-sm leading-6 text-[#c7ded4]">{copy[notice]}</p> : null}
          {actionError ? <p role="alert" className="border-l-2 border-[#d7a897] bg-[#241b18] px-4 py-3 text-sm leading-6 text-[#edcab8]">{actionError}</p> : null}
        </div>

        {loading ? <p role="status" className="py-16 text-sm text-[#abc2bb]">{copy.loading}</p> : loginRequired ? (
          <section className="max-w-xl py-16"><h2 className="font-serif text-3xl leading-snug [text-wrap:balance]">{copy.loginTitle}</h2><p className="mt-4 text-sm leading-7 text-[#a6bab3]">{copy.loginText}</p><Link href="/login?next=%2Fdrafts" className="mt-7 inline-flex min-h-11 items-center border-b border-[#b5d8c8] text-sm text-[#d8e9e0] focus-visible:outline-2 focus-visible:outline-offset-4">{copy.login} ↗</Link></section>
        ) : null}
        {!loading && !loginRequired && loadFailed ? <section role="alert" className="my-8 border border-[#70594c] p-5"><h2 className="text-base">{copy.errorTitle}</h2><p className="mt-2 max-w-3xl text-sm leading-7 text-[#c8b7ab]">{copy.unavailable}</p><button type="button" onClick={() => void refresh()} className="mt-3 min-h-10 border-b border-[#c8b7ab] text-sm">{copy.checkStatus} ↻</button></section> : null}
        {!loading && !loginRequired && !loadFailed && drafts.length === 0 ? <section className="max-w-2xl py-20"><h2 className="font-serif text-3xl leading-snug [text-wrap:balance]">{copy.emptyTitle}</h2><p className="mt-4 text-sm leading-7 text-[#a6bab3] [text-wrap:pretty]">{copy.emptyText}</p></section> : null}

        {!loginRequired ? <div className="mt-3 divide-y divide-[#344441]">
          {drafts.map((row, index) => {
            const expired = !!row.expiresAt && Date.parse(row.expiresAt) <= checkedAt;
            const uncertain = uncertainRequests.has(row.requestId) || row.finalStatus === "unknown";
            const playable = row.status === "completed" && !!row.url;
            const canFinalize = row.canFinalize && !!row.id && !expired && !uncertain && Number.isSafeInteger(row.finalCredits) && Number(row.finalCredits) > 0;
            return <article key={row.requestId} className="py-9 sm:py-12">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#9cb5ac]">
                <span className="tabular-nums tracking-widest">{String(drafts.length - index).padStart(2, "0")} <span aria-hidden="true">/</span> {copy.draft}</span>
                <span className={row.status === "failed" ? "text-[#e0b4a1]" : "text-[#b5d8c8]"}>{statusLabel(row.status)}</span>
              </div>
              <div className={`grid min-w-0 gap-6 ${row.finalUrl ? "xl:grid-cols-2" : "lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]"}`}>
                <div className="min-w-0">
                  <div className="aspect-video overflow-hidden rounded-sm border border-[#2d403a] bg-[#060b0a]">
                    {playable ? <video key={row.url} src={row.url!} controls preload="metadata" playsInline aria-label={copy.draft} onError={() => setPlaybackErrors(previous => new Set(previous).add(`${row.requestId}:draft`))} className="h-full w-full object-contain" /> : <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center"><span className="text-sm text-[#c1d7cb]">{statusLabel(row.status)}</span><span className="text-xs text-[#819991]">{copy.waiting}</span></div>}
                  </div>
                  {playbackErrors.has(`${row.requestId}:draft`) ? <p role="alert" className="mt-2 text-xs leading-6 text-[#e0b4a1]">{copy.playbackError}</p> : null}
                  {playable ? <button type="button" onClick={() => downloadResult({ id: row.id || row.requestId, kind: "video", url: row.url! })} className="mt-3 min-h-10 border-b border-[#53695e] text-xs text-[#c7ded4] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4">{copy.download} ↓</button> : null}
                </div>
                {row.finalUrl ? <div className="min-w-0"><div className="aspect-video overflow-hidden rounded-sm border border-[#668274] bg-[#060b0a]"><video key={row.finalUrl} src={row.finalUrl} controls preload="metadata" playsInline aria-label={copy.final} onError={() => setPlaybackErrors(previous => new Set(previous).add(`${row.requestId}:final`))} className="h-full w-full object-contain" /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-[#bdd7c8]">{copy.final}</span><button type="button" onClick={() => downloadResult({ id: row.finalId || row.requestId, kind: "video", url: row.finalUrl! })} className="min-h-10 border-b border-[#53695e] text-xs text-[#c7ded4] focus-visible:outline-2 focus-visible:outline-offset-4">{copy.download} ↓</button></div>{playbackErrors.has(`${row.requestId}:final`) ? <p role="alert" className="text-xs leading-6 text-[#e0b4a1]">{copy.playbackError}</p> : null}</div> : <div className="flex min-w-0 flex-col justify-between">
                  <div><p className="text-xs text-[#b2cabe]">{copy.prompt}</p><p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-[#c3d1c8] [text-wrap:pretty]">{row.prompt}</p></div>
                  <div className="mt-6">
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs leading-6"><dt className="text-[#819991]">{copy.created}</dt><dd>{dateLabel(row.createdAt)}</dd><dt className="text-[#819991]">{copy.expires}</dt><dd className={expired ? "text-[#e0b4a1]" : "text-[#b5d8c8]"}>{row.expiresAt ? expired ? copy.expired : dateLabel(row.expiresAt) : copy.pendingExpiry}</dd><dt className="text-[#819991]">{copy.draftQuote}</dt><dd style={{ textWrap: "nowrap" }}>{pointLabel(row.draftCredits)}</dd><dt className="text-[#819991]">{copy.finalQuote}</dt><dd style={{ textWrap: "nowrap" }}>{pointLabel(row.finalCredits)}</dd></dl>
                    {canFinalize ? <button type="button" disabled={!!busyDraft} onClick={() => openConfirmation(row)} className="mt-5 min-h-12 w-full rounded-full border border-[#88b49d] px-5 py-3 text-sm text-[#cce2d4] transition-colors hover:bg-[#254134] disabled:opacity-50 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4">{copy.finalize} ↗</button> : pending(row.finalStatus) || uncertain ? <div role="status" className="mt-5 border-l-2 border-[#698b79] px-4 py-2"><p className="text-sm text-[#cce2d4]">{uncertain ? copy.unknown : copy.finalizing}</p><p className="mt-2 text-xs leading-6 text-[#9bb5a7]">{uncertain ? copy.uncertain : copy.persistenceNotice}</p><button type="button" onClick={() => void refresh()} className="mt-2 min-h-10 border-b border-[#698b79] text-xs text-[#c7ded4]">{copy.checkStatus} ↻</button></div> : row.finalStatus === "failed" ? <p role="status" className="mt-5 text-sm text-[#e0b4a1]">{copy.final} · {copy.failed}</p> : null}
                    <p className="mt-3 text-[11px] leading-6 text-[#819991] [text-wrap:pretty]">{copy.separateCharges}</p>
                  </div>
                </div>}
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#90aa9c]"><span>{row.seconds} {copy.seconds} · {row.aspectRatio}</span><span>{row.generateAudio ? copy.soundOn : copy.soundOff}</span></div>
              {row.finalUrl ? <details className="mt-4 text-xs text-[#90aa9c]"><summary className="min-h-8 cursor-pointer content-center">{copy.prompt}</summary><p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-7 text-[#b5c8bb]">{row.prompt}</p><p className="mt-3 leading-6">{copy.draftQuote} {pointLabel(row.draftCredits)} · {copy.finalQuote} {pointLabel(row.finalCredits)}</p></details> : null}
            </article>;
          })}
        </div> : null}
        <p className="mt-8 border-t border-[#344441] pt-6 text-xs leading-7 text-[#819991] [text-wrap:pretty]">{copy.persistenceNotice}</p>
      </div>

      <dialog ref={dialog} aria-labelledby="draft-final-confirm-title" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-sm border border-[#5b7b68] bg-[#111d17] p-6 text-[#e0eade] shadow-2xl backdrop:bg-black/80 sm:p-9">
        <button type="button" aria-label={copy.close} onClick={() => { dialog.current?.close(); setSelected(null); }} className="absolute right-3 top-3 min-h-10 min-w-10 text-xl text-[#a2beac] hover:text-white focus-visible:outline-2">×</button>
        <p className="pr-8 text-xs tracking-widest text-[#9bbba4]">480p → 1080p</p>
        <h2 id="draft-final-confirm-title" className="mt-5 pr-5 font-serif text-3xl leading-snug [text-wrap:balance]">{copy.confirmTitle}</h2>
        <p className="mt-5 text-sm leading-7 text-[#b1c8b7]">{copy.confirmText}</p>
        <dl className="my-6 space-y-4 border-y border-[#496550] py-5 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-[#a4bda8]">{copy.alreadyCharged}</dt><dd className="shrink-0" style={{ textWrap: "nowrap" }}>{pointLabel(selected?.draftCredits ?? null)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>{copy.chargedNow}</dt><dd className="shrink-0 text-lg tabular-nums text-[#d5e9d5]" style={{ textWrap: "nowrap" }}>{pointLabel(selected?.finalCredits ?? null)}</dd></div></dl>
        <p className="text-xs leading-6 text-[#96b39c]">{copy.inheritance}</p>
        <p className="mt-3 text-xs leading-6 text-[#c1d4bf]">{copy.separateCharges}</p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row"><button type="button" onClick={() => { dialog.current?.close(); setSelected(null); }} className="min-h-12 flex-1 rounded-full border border-[#496550] px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">{copy.cancel}</button><button type="button" disabled={!!busyDraft || !selected} onClick={() => void finalize()} className="min-h-12 flex-[1.4] rounded-full bg-[#c9e1c5] px-4 py-3 text-sm text-[#19301c] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">{busyDraft ? copy.submitting : copy.confirm}</button></div>
      </dialog>
    </div>
  );
}
