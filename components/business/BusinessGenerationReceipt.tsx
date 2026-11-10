"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { businessOperationsCopy, type BusinessOperationsCopy } from "@/lib/i18n/businessOperations";
import type { BusinessGeneration } from "./types";
import styles from "./BusinessOperations.module.css";

export function businessBillingStateText(job: BusinessGeneration, t: BusinessOperationsCopy): string {
  if (job.billingStatus === "matched" && job.providerCost != null) return t.matchedCostStatus;
  if (job.billingEligibility === "generation_pending" || ["submitting", "processing", "unknown"].includes(job.status)) return t.unfinishedCost;
  if (job.billingEligibility === "incomplete_request") return t.incompleteCost;
  if (!job.providerRequestId) return t.legacyCost;
  if (job.billingStatus === "unavailable") return t.blockedCost;
  if (job.billingCheckedAt) return t.checkedCost;
  return t.pendingCost;
}
export function businessCostText(job: BusinessGeneration, t: BusinessOperationsCopy): string {
  return job.billingStatus === "matched" && job.providerCost != null ? `${job.providerCurrency ?? "USD"} ${job.providerCost}` : businessBillingStateText(job, t);
}
export function businessDurationText(ms: number | null | undefined, locale: string, suffix: string): string | null {
  return ms !== null && ms !== undefined && Number.isFinite(ms) && ms >= 0 ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} ${suffix}` : null;
}
function outcomeMessage(reason: unknown, t: BusinessOperationsCopy): string {
  switch (reason) {
    case "not_found": return t.unmatchedCost;
    case "provider_pending": return t.providerPending;
    case "provider_auth": return t.billingUnavailable;
    case "outside_scope": return t.unavailableCost;
    case "receipt_mismatch": return t.receiptMismatch;
    case "mixed_currency": return t.mixedCurrency;
    case "not_configured": return t.billingNotConfigured;
    case "recently_checked": return t.recentlyChecked;
    case "rate_limited": return t.billingRateLimited;
    case "deferred": return t.batchDeferred;
    case "temporary": return t.billingFailed;
    default: return "";
  }
}
export default function BusinessGenerationReceipt({ job, onUpdated, inUsageTable = false, syncDisabled = false, batchReason }: {
  job: BusinessGeneration;
  onUpdated?: (job: BusinessGeneration) => void;
  inUsageTable?: boolean;
  syncDisabled?: boolean;
  batchReason?: string;
}) {
  const locale = useLocale(), t = businessOperationsCopy(locale);
  const [syncing, setSyncing] = useState(false), [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const locked = useRef(false);
  const verified = job.billingStatus === "matched" && job.providerCost != null;
  const canSync = !verified && (job.billingEligibility ? job.billingEligibility === "ready" : Boolean(job.providerRequestId) && ["completed", "failed"].includes(job.status));
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value)) : t.unknown;
  const sync = async () => {
    if (locked.current || syncDisabled || !canSync) return;
    locked.current = true; setSyncing(true); setError(""); setFeedback("");
    try {
      const response = await fetch(`/api/business/generations/${encodeURIComponent(job.id)}/billing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.generation || body.generation.id !== job.id) throw new Error("billing");
      onUpdated?.(body.generation);
      setFeedback(body.generation.billingStatus === "matched" ? t.costUpdated : outcomeMessage(body.billing?.reason, t) || businessBillingStateText(body.generation, t));
    } catch { setError(t.billingFailed); }
    finally { locked.current = false; setSyncing(false); }
  };
  const note = verified ? (feedback === t.costUpdated ? feedback : "") : outcomeMessage(batchReason, t) || feedback;
  return <details className={`${styles.details} ${inUsageTable ? styles.tableDetails : ""}`}>
    <summary>{!inUsageTable && <>{t.cost} · </>}<span className={verified ? styles.cost : styles.pending}>{businessCostText(job, t)}</span></summary>
    <dl className={styles.receipt}>
      <div><dt>{t.elapsed}</dt><dd>{businessDurationText(job.durationMs, locale, t.seconds) ?? (["processing", "submitting"].includes(job.status) ? t.durationPending : t.unknown)}<small>{t.observedTime}</small></dd></div>
      <div><dt>{t.providerTime}</dt><dd>{businessDurationText(job.providerDurationMs, locale, t.seconds) ?? t.unknown}</dd></div>
      <div><dt>{t.submitted}</dt><dd>{date(job.submittedAt ?? job.createdAt)}</dd></div><div><dt>{t.completed}</dt><dd>{date(job.completedAt)}</dd></div>
      <div><dt>{t.providerRequest}</dt><dd>{job.providerRequestId ?? t.unknown}{job.providerHttpStatus ? ` · HTTP ${job.providerHttpStatus}` : ""}</dd></div>
      {inUsageTable && <div><dt>{t.generationId}</dt><dd>{job.id}</dd></div>}
      <div><dt>{t.billingStatus}</dt><dd>{businessBillingStateText(job, t)}</dd></div>
      <div><dt>{t.lastChecked}</dt><dd>{job.billingCheckedAt ? <time dateTime={job.billingCheckedAt}>{date(job.billingCheckedAt)}</time> : t.unknown}</dd></div>
    </dl>
    {canSync && <button className={styles.button} type="button" disabled={syncing || syncDisabled} onClick={() => void sync()}>{syncing ? t.syncing : t.syncCost}</button>}
    {note && <p className={styles.notice} role="status">{note}</p>}
    {error && !verified && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
  </details>;
}
