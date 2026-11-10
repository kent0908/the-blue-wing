"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { businessCopy } from "@/lib/i18n/business";
import { businessOperationsCopy } from "@/lib/i18n/businessOperations";
import { modelLabel } from "@/lib/modelLabel";
import type { BusinessGeneration } from "./types";
import BusinessGenerationReceipt, { businessBillingStateText, businessDurationText } from "./BusinessGenerationReceipt";
import styles from "./BusinessOperations.module.css";

interface Report {
  generations: BusinessGeneration[]; models: string[]; range: { from: string; to: string; timezone: string };
  pagination: { page: number; total: number; totalPages: number; hasMore: boolean };
  stats: { requests: number; completed: number; failed: number; pending: number; matchedCost: string | null; currency: string; matchedCount: number; unmatchedCount: number };
  billing: { configured: boolean; reconcilableCount: number };
}
const outcomes = ["matched", "pending", "unavailable", "skipped", "error"] as const;
interface Reconciliation {
  configured: boolean;
  results: { id: string; reason?: string }[];
  summary: Record<typeof outcomes[number], number>;
}

export default function BusinessUsage() {
  const locale = useLocale(), t = businessOperationsCopy(locale), b = businessCopy(locale);
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [model, setModel] = useState(""), [status, setStatus] = useState("");
  const [report, setReport] = useState<Report | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [exportStatus, setExportStatus] = useState<"" | "ready" | "error">("");
  const [filtered, setFiltered] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [reconcileError, setReconcileError] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const batch = useRef<AbortController | null>(null);
  const activeQuery = useRef("");
  const latestRequest = useRef({ query: "", page: 1 });
  const load = useCallback(async (query = "", page = 1, retainResult = false) => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    latestRequest.current = { query, page };
    setLoading(true); setError(""); setExportStatus("");
    if (!retainResult) { setReconciliation(null); setReconcileError(false); }
    const params = new URLSearchParams(query); params.set("page", String(page));
    try {
      const response = await fetch(`/api/business/usage?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(body?.generations) || !body.pagination || !body.stats || !body.range) throw new Error(body?.error?.code === "invalid_parameters" ? "range" : "usage");
      setReport(body); setFiltered(Boolean(query)); activeQuery.current = query;
      if (!query) { setFrom(body.range.from); setTo(body.range.to); setModel(""); setStatus(""); }
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error && error.message === "range" ? "range" : "usage"); }
    finally { if (!controller.signal.aborted) { pending.current = null; setLoading(false); } }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; pending.current?.abort(); batch.current?.abort(); };
  }, [load]);
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    if (batch.current) return;
    const query = new URLSearchParams();
    if (from) query.set("from", from); if (to) query.set("to", to); if (model) query.set("model", model); if (status) query.set("status", status);
    void load(query.toString());
  };
  const onUpdated = (job: BusinessGeneration) => {
    setReport(current => current ? { ...current, generations: current.generations.map(old => old.id === job.id ? { ...old, ...job } : old) } : current);
    if (batch.current) return;
    const { query, page } = latestRequest.current;
    void load(query, page);
  };
  const reconcile = async () => {
    if (loading || batch.current || !report?.billing?.configured) return;
    const ids = report.generations.filter(job => job.billingEligibility === "ready").map(job => job.id);
    if (!ids.length) return;
    const query = activeQuery.current;
    const { page } = report.pagination;
    const params = new URLSearchParams(query);
    params.set("from", report.range.from);
    params.set("to", report.range.to);
    params.set("page", String(page));
    const controller = new AbortController();
    batch.current = controller;
    setReconciling(true); setReconciliation(null); setReconcileError(false); setExportStatus("");
    try {
      const response = await fetch(`/api/business/usage/reconcile?${params}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || typeof body?.configured !== "boolean" || !Array.isArray(body.results) ||
        !outcomes.every(key => Number.isSafeInteger(body.summary?.[key]) && body.summary[key] >= 0)) throw new Error("billing");
      await load(query, page, true);
      if (!controller.signal.aborted) setReconciliation(body);
    } catch {
      if (!controller.signal.aborted) setReconcileError(true);
    } finally {
      if (!controller.signal.aborted) { batch.current = null; setReconciling(false); }
    }
  };
  const download = () => {
    if (!report) return;
    const safe = (value: string | number | null | undefined) => {
      const text = String(value ?? "");
      return `"${(/^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
    };
    const rows = [[t.generationId, t.providerRequest, t.model, t.status, t.submitted, t.completed, `${t.elapsed} (ms)`, t.billingStatus, t.cost, t.currency, t.lastChecked], ...report.generations.map(job => {
      const verified = job.billingStatus === "matched" && job.providerCost != null;
      return [job.id, job.providerRequestId, job.model, b[job.status], job.submittedAt ?? job.createdAt, job.completedAt, job.durationMs,
        businessBillingStateText(job, t), verified ? job.providerCost : null, verified ? job.providerCurrency ?? "USD" : null, job.billingCheckedAt];
    })];
    try {
      const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(safe).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      try {
        link.href = url; link.download = `business-usage-${report.range.from}-${report.range.to}-page${report.pagination.page}.csv`;
        document.body.append(link); link.click(); setExportStatus("ready");
      } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch { setExportStatus("error"); }
  };
  const dateFormat = new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: report?.range.timezone ?? "Asia/Taipei" });
  const date = (value: string) => Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : t.unknown;
  const page = report?.pagination.page ?? 1;
  const busy = loading || reconciling;
  const billingConfigured = report?.billing?.configured;
  const readyCount = report?.billing?.reconcilableCount ?? 0;
  const batchReasons = new Map(reconciliation?.results.map(result => [result.id, result.reason]));
  const summaryLabels = { matched: t.matchedCostStatus, pending: t.pendingCost, unavailable: t.blockedCost, skipped: t.lookupSkipped, error: t.lookupErrors };
  return <section className={`${styles.page} ${styles.usagePage}`} aria-label={t.usageTitle}>
    <div className={styles.usageTools}><details className={styles.usageFilters}>
      <summary>{t.filters}{filtered ? ` · ${t.filterOn}` : ""}</summary>
      <form className={styles.form} onSubmit={apply}>
        <label className={styles.field}>{t.dateFrom}<input type="date" required value={from} onChange={e => setFrom(e.target.value)} max={to || undefined} /></label>
        <label className={styles.field}>{t.dateTo}<input type="date" required value={to} onChange={e => setTo(e.target.value)} min={from || undefined} /></label>
        <label className={styles.field}>{t.model}<select value={model} onChange={e => setModel(e.target.value)}><option value="">{t.all}</option>{report?.models.map(value => <option key={value} value={value}>{modelLabel(value)}</option>)}</select></label>
        <label className={styles.field}>{t.status}<select value={status} onChange={e => setStatus(e.target.value)}><option value="">{t.all}</option>{(["completed", "failed", "processing", "submitting", "unknown"] as const).map(value => <option key={value} value={value}>{b[value]}</option>)}</select></label>
        <div className={styles.rowActions}><button className={styles.button} disabled={busy} type="submit">{t.apply}</button><button className={styles.button} disabled={busy} type="button" onClick={() => void load()}>{t.clear}</button></div>
      </form>
    </details><button className={styles.button} type="button" disabled={busy} onClick={() => void load(activeQuery.current, page)}>{loading ? t.refreshing : t.reload}</button></div>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error === "range" ? t.invalidRange : t.usageFailed}</p>}
    {report && <>
      <div className={styles.rangeLine}><time dateTime={report.range.from}>{report.range.from}</time><span aria-hidden="true">–</span><time dateTime={report.range.to}>{report.range.to}</time><span>{report.range.timezone}</span></div>
      <dl className={styles.stats}>
        <div className={styles.stat}><dt>{t.totalCost}</dt><dd>{report.stats.matchedCost ?? "—"}<span>{report.stats.currency}</span></dd><dd className={styles.statNote}>{t.matchedCostStatus} {report.stats.matchedCount.toLocaleString(locale)} · {t.unreconciledCost} {report.stats.unmatchedCount.toLocaleString(locale)}</dd></div>
        <div className={styles.stat}><dt>{t.totalJobs}</dt><dd>{report.stats.requests.toLocaleString(locale)}</dd><dd className={styles.statNote}>{t.completedJobs} {report.stats.completed} · {t.failedJobs} {report.stats.failed} · {t.pendingJobs} {report.stats.pending}</dd></div>
      </dl>
    </>}
    {report?.generations.length ? <>
      <div className={styles.tableBar}>
        <div className={styles.tableScope}>
          <strong>{t.recordCount.replace("{count}", report.pagination.total.toLocaleString(locale))}</strong>
          <span id="business-billing-page-scope">{!billingConfigured ? t.billingNotConfigured : readyCount ? t.pageReadyCount.replace("{count}", readyCount.toLocaleString(locale)) : t.noPageReady}</span>
        </div>
        <div className={styles.rowActions}>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || !billingConfigured || !readyCount} aria-describedby="business-billing-page-scope" onClick={reconcile}>{reconciling ? t.syncing : t.reconcilePage}</button>
          <button type="button" className={styles.button} disabled={busy} onClick={download}>{t.download}</button>
        </div>
      </div>
      {reconciling && <p className={styles.visuallyHidden} role="status">{t.syncing}</p>}
      {reconcileError && <p className={`${styles.notice} ${styles.error}`} role="alert">{t.batchFailed}</p>}
      {reconciliation && <div className={styles.reconciliation} role="status">
        <strong>{t.batchFinished}</strong>
        {reconciliation.configured ? <>
          <ul>{outcomes.filter(key => reconciliation.summary[key] > 0).map(key => <li key={key}>{summaryLabels[key]} <b>{reconciliation.summary[key].toLocaleString(locale)}</b></li>)}</ul>
          {reconciliation.summary.skipped > 0 && <small>{t.batchDeferred}</small>}
        </> : <small>{t.billingNotConfigured}</small>}
      </div>}
      {exportStatus && <p className={`${styles.notice} ${exportStatus === "error" ? styles.error : ""}`} role={exportStatus === "error" ? "alert" : "status"}>{exportStatus === "ready" ? t.downloadStarted : t.downloadFailed}</p>}
      <table className={styles.table} aria-label={t.usageTitle} aria-busy={busy} role="table">
        <thead role="rowgroup"><tr role="row"><th scope="col">{t.model}</th><th scope="col">{t.submitted}</th><th scope="col">{t.status}</th><th scope="col">{t.elapsed}</th><th scope="col">{t.cost}</th></tr></thead>
        <tbody role="rowgroup">{report.generations.map(job => <tr key={job.id} role="row">
          <td role="cell"><strong>{modelLabel(job.model)}</strong><small>{t[job.kind]}</small></td>
          <td role="cell"><span className={styles.mobileLabel} aria-hidden="true">{t.submitted}</span><time dateTime={job.submittedAt ?? job.createdAt}>{date(job.submittedAt ?? job.createdAt)}</time></td>
          <td role="cell"><span className={styles.mobileLabel} aria-hidden="true">{t.status}</span><span className={styles.status} data-status={job.status}>{b[job.status]}</span>{job.providerHttpStatus ? <small>HTTP {job.providerHttpStatus}</small> : null}</td>
          <td role="cell"><span className={styles.mobileLabel} aria-hidden="true">{t.elapsed}</span>{businessDurationText(job.durationMs, locale, t.seconds) ?? t.unknown}</td>
          <td role="cell"><span className={styles.mobileLabel} aria-hidden="true">{t.cost}</span><BusinessGenerationReceipt job={job} onUpdated={onUpdated} inUsageTable syncDisabled={busy || !billingConfigured} batchReason={batchReasons.get(job.id)} /></td>
        </tr>)}</tbody>
      </table>
      {report.pagination.totalPages > 1 && <div className={styles.pagination}><button className={styles.button} type="button" disabled={busy || page <= 1} onClick={() => void load(activeQuery.current, page - 1)}>{t.previous}</button><span>{page} / {report.pagination.totalPages}</span><button className={styles.button} type="button" disabled={busy || !report.pagination.hasMore} onClick={() => void load(activeQuery.current, page + 1)}>{t.next}</button></div>}
    </> : loading ? <p className={styles.empty} role="status">{t.refreshing}</p> : !error && <p className={styles.empty}>{t.noHistory}</p>}
  </section>;
}
