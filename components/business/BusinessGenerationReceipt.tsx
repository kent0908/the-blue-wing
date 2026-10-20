"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { businessOperationsCopy, type BusinessOperationsCopy } from "@/lib/i18n/businessOperations";
import type { BusinessGeneration } from "./types";
import styles from "./BusinessOperations.module.css";

export function businessCostText(job: BusinessGeneration, t: BusinessOperationsCopy): string {
  if (job.billingStatus === "matched" && job.providerCost !== null && job.providerCost !== undefined) return `${job.providerCurrency ?? "USD"} ${job.providerCost}`;
  if (job.billingStatus === "unavailable") return t.unavailableCost;
  if (!job.providerRequestId && !["submitting", "processing"].includes(job.status)) return t.legacyCost;
  return t.pendingCost;
}
export function businessDurationText(ms: number | null | undefined, locale: string, suffix: string): string | null {
  return ms !== null && ms !== undefined && Number.isFinite(ms) && ms >= 0 ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} ${suffix}` : null;
}
export default function BusinessGenerationReceipt({ job, onUpdated }: { job: BusinessGeneration; onUpdated?: (job: BusinessGeneration) => void }) {
  const locale = useLocale(), t = businessOperationsCopy(locale);
  const [syncing, setSyncing] = useState(false), [error, setError] = useState("");
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value)) : t.unknown;
  const sync = async () => {
    if (syncing || !job.providerRequestId) return;
    setSyncing(true); setError("");
    try {
      const response = await fetch(`/api/business/generations/${encodeURIComponent(job.id)}/billing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.generation || body.generation.id !== job.id) throw new Error("billing");
      onUpdated?.(body.generation);
    } catch { setError(t.billingFailed); }
    finally { setSyncing(false); }
  };
  return <details className={styles.details}>
    <summary>{t.cost} · {businessCostText(job, t)}</summary>
    <dl className={styles.receipt}>
      <div><dt>{t.elapsed}</dt><dd>{businessDurationText(job.durationMs, locale, t.seconds) ?? (["processing", "submitting"].includes(job.status) ? t.durationPending : t.unknown)}<small>{t.observedTime}</small></dd></div>
      <div><dt>{t.providerTime}</dt><dd>{businessDurationText(job.providerDurationMs, locale, t.seconds) ?? t.unknown}</dd></div>
      <div><dt>{t.submitted}</dt><dd>{date(job.submittedAt ?? job.createdAt)}</dd></div><div><dt>{t.completed}</dt><dd>{date(job.completedAt)}</dd></div>
      <div><dt>{t.providerRequest}</dt><dd className={styles.monospace}>{job.providerRequestId ?? t.unknown}{job.providerHttpStatus ? ` · HTTP ${job.providerHttpStatus}` : ""}</dd></div>
      <div><dt>{t.cost}</dt><dd>{businessCostText(job, t)}</dd></div>
    </dl>
    <p>{t.noCostEstimate}</p><button className={styles.button} type="button" disabled={syncing || !job.providerRequestId} onClick={() => void sync()}>{syncing ? t.syncing : t.syncCost}</button>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
  </details>;
}
